import "server-only";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

// Media lives in Cloudinary as "authenticated" assets, so it can only be fetched through a signed
// URL the server builds. Cloudinary reads its credentials from CLOUDINARY_URL.
// Audio is stored as Cloudinary's "video" resource type, which covers both.
const ASSET = { resource_type: "video", type: "authenticated" } as const;
const FOLDER = "transcript-review";

const CHUNK = 6_000_000;

/**
 * Uploads a media file (or anything with a stream, such as a Google Drive download) and returns the name to
 * store on the job ("<public id>.<format>") and its size. onProgress hears how many bytes have been read so far.
 */
export async function uploadMedia(file: { stream(): ReadableStream<Uint8Array> }, onProgress?: (bytes: number) => void) {
  const source = onProgress ? counted(file.stream(), onProgress) : file.stream();
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_chunked_stream(
      { ...ASSET, folder: FOLDER, chunk_size: CHUNK },
      (err, res) => (err || !res ? reject(err ?? new Error("Upload failed")) : resolve(res)),
    );
    pipeline(Readable.fromWeb(source as never), upload).catch(reject);
  });
  return { name: `${result.public_id}.${result.format}`, bytes: result.bytes };
}

/**
 * Hands the stream on in small pieces, only as fast as Cloudinary takes them, counting as it goes.
 * Cloudinary reads the next piece once the last chunk is stored, so the count stays within one chunk
 * (5 MB is its minimum) of what is really saved. An uploaded file arrives as one big piece, hence the slicing.
 */
function counted(stream: ReadableStream<Uint8Array>, onProgress: (bytes: number) => void) {
  const reader = stream.getReader();
  let rest: Uint8Array | null = null;
  let read = 0;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (!rest?.byteLength) {
          const next = await reader.read();
          if (next.done) return controller.close();
          rest = next.value;
        }
        const piece = rest.subarray(0, 256 * 1024);
        rest = rest.subarray(piece.byteLength);
        onProgress((read += piece.byteLength));
        controller.enqueue(piece);
      },
      cancel: (reason) => reader.cancel(reason),
    },
    { highWaterMark: 0 },
  );
}

function split(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? { publicId: name.slice(0, dot), format: name.slice(dot + 1) } : { publicId: name, format: undefined };
}

/** Signed delivery URL for a stored media file. Only ever used server-side; the browser goes through /api/media. */
export function mediaUrl(name: string) {
  const { publicId, format } = split(name);
  return cloudinary.url(publicId, { ...ASSET, format, sign_url: true, secure: true });
}

export async function deleteMedia(name: string) {
  try {
    await cloudinary.uploader.destroy(split(name).publicId, { ...ASSET, invalidate: true });
  } catch {
    // Already gone; nothing to do.
  }
}
