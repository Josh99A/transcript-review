import "server-only";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

// Media lives in Cloudinary as "authenticated" assets, so it can only be fetched through a signed
// URL the server builds. Cloudinary reads its credentials from CLOUDINARY_URL.
// Audio is stored as Cloudinary's "video" resource type, which covers both.
const ASSET = { resource_type: "video", type: "authenticated" } as const;
const FOLDER = "transcript-review";

/** Uploads a media file and returns the name to store on the job ("<public id>.<format>") and its size. */
export async function uploadMedia(file: File) {
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_chunked_stream(
      { ...ASSET, folder: FOLDER, chunk_size: 20_000_000 },
      (err, res) => (err || !res ? reject(err ?? new Error("Upload failed")) : resolve(res)),
    );
    pipeline(Readable.fromWeb(file.stream() as never), upload).catch(reject);
  });
  return { name: `${result.public_id}.${result.format}`, bytes: result.bytes };
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
