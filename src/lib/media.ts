import "server-only";
import path from "node:path";
import { mkdir, stat, unlink } from "node:fs/promises";

export const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./uploads");

export async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

/** Resolve a stored file name inside the upload folder, refusing anything that escapes it. */
export function mediaFile(name: string) {
  const full = path.resolve(UPLOAD_DIR, name);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new Error("Invalid media path");
  return full;
}

export async function deleteMedia(name: string) {
  try {
    await unlink(mediaFile(name));
  } catch {
    // Already gone; nothing to do.
  }
}

/** Size of a stored media file in bytes, or 0 if it's missing. */
export async function mediaSize(name: string) {
  try {
    return (await stat(mediaFile(name))).size;
  } catch {
    return 0;
  }
}
