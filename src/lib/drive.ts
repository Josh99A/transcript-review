import "server-only";
import { mediaTypeOf } from "./mediaTypes";

// Files come from Google Drive share links. They have to be shared as "Anyone with the link", since the app
// has no Google account of its own; anything else comes back as Google's sign-in page.

/** The file id in a Drive or Docs link (or a bare id), or null if it doesn't look like one. */
export function driveFileId(link: string): string | null {
  const s = link.trim();
  const m = s.match(/\/(?:file|document|presentation|spreadsheets)\/(?:u\/\d+\/)?d\/([\w-]{10,})/) ?? s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(s) ? s : null;
}

export type DriveKind = "media" | "transcript";
export type DriveFile = { id: string; name: string; type: string; size: number | null; res: Response };

function fileName(disposition: string | null) {
  if (!disposition) return null;
  const star = disposition.match(/filename\*=(?:UTF-8|utf-8)''([^;]+)/);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {}
  }
  return disposition.match(/filename="([^"]+)"/)?.[1] ?? disposition.match(/filename=([^;]+)/)?.[1]?.trim() ?? null;
}

async function get(url: string, range?: string | null) {
  const res = await fetch(url, { headers: range ? { range } : {}, redirect: "follow", cache: "no-store" });
  // Private or missing files come back as an HTML page (sign-in, "not found" or similar), never as a download.
  if (!res.ok || /text\/html/i.test(res.headers.get("content-type") ?? "")) {
    void res.body?.cancel().catch(() => {});
    return null;
  }
  return res;
}

/**
 * Starts downloading a Drive file. Ordinary files download as they are; a Google Doc is exported as Word.
 * `range` passes through so a media player can read just the start of a long recording.
 */
export async function openDriveFile(id: string, kind: DriveKind, range?: string | null): Promise<DriveFile | { error: string }> {
  if (!/^[\w-]{10,}$/.test(id)) return { error: "That doesn't look like a Google Drive link." };
  let res = await get(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, range);
  let doc = false;
  if (!res && kind === "transcript") {
    res = await get(`https://docs.google.com/document/d/${id}/export?format=docx`);
    doc = true;
  }
  if (!res) return { error: "Google Drive wouldn't share that file. In Drive, set Share > General access to \"Anyone with the link\", then try again." };

  let name = fileName(res.headers.get("content-disposition")) ?? (doc ? "Transcript.docx" : "Drive file");
  if (doc && !/\.docx$/i.test(name)) name += ".docx";
  const reported = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const total = res.headers.get("content-range")?.match(/\/(\d+)$/)?.[1] ?? (res.status === 200 ? res.headers.get("content-length") : null);
  const size = total ? Number(total) : null;

  if (kind === "media") {
    const type = mediaTypeOf(name, reported);
    if (!type) {
      void res.body?.cancel().catch(() => {});
      return { error: `"${name}" isn't audio or video. Use an MP3, AAC, WAV, M4A or MP4.` };
    }
    return { id, name, type, size, res };
  }
  if (!/\.(docx|txt)$/i.test(name)) {
    void res.body?.cancel().catch(() => {});
    return { error: `"${name}" isn't a transcript. Use a Google Doc, a Word .docx or a .txt file.` };
  }
  return { id, name, type: reported, size, res };
}

/** Downloads a Drive transcript into a File, so it is read exactly like an uploaded one. */
export async function driveTranscript(id: string): Promise<File | { error: string }> {
  const f = await openDriveFile(id, "transcript");
  if ("error" in f) return f;
  if (f.size && f.size > 10 * 1024 * 1024) {
    void f.res.body?.cancel().catch(() => {});
    return { error: "That transcript is over 10 MB." };
  }
  return new File([await f.res.arrayBuffer()], f.name, { type: f.type });
}
