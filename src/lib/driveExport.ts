import "server-only";
import { after } from "next/server";
import { db } from "./db";
import { htmlToDocx, textToDocx } from "./docx";
import { mediaUrl } from "./media";
import { cleanDoc } from "./richDoc";

// Approved jobs are copied into a folder in an admin's own Google Drive: one folder per job with its recording
// and the final transcript as Word. An admin connects their Google account once (OAuth, "drive.file" scope, so
// the app only ever sees the files it made). Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from Google Cloud.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_TYPE = "application/vnd.google-apps.folder";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KEYS = { token: "driveRefreshToken", account: "driveAccount", folder: "driveFolderId" } as const;
export const DRIVE_FOLDER_NAME = "Transcript exports";

export function driveExportConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function setting(key: string) {
  return (await db.setting.findUnique({ where: { key } }))?.value || null;
}
async function save(key: string, value: string) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Whether Drive export is set up, and with which account and folder. */
export async function driveExportStatus() {
  if (!driveExportConfigured()) return { configured: false as const };
  const [token, account, folderId] = await Promise.all([setting(KEYS.token), setting(KEYS.account), setting(KEYS.folder)]);
  return { configured: true as const, connected: !!token, account, folderUrl: folderId ? folderLink(folderId) : null };
}

export function folderLink(id: string) {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** The address Google sends the admin back to. It must also be listed on the OAuth client in Google Cloud. */
export function redirectUri(req: Request) {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (base) return `${base}/api/drive-export/callback`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}/api/drive-export/callback`;
}

export function authUrl(redirect: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Always ask, so Google hands back a refresh token even if this account connected before.
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new DriveError(data.error_description ?? data.error ?? `Google sign-in failed (${res.status})`, data.error === "invalid_grant");
  return data;
}

class DriveError extends Error {
  constructor(message: string, readonly revoked = false) {
    super(message);
  }
}

let cached: { token: string; until: number } | null = null;

async function accessToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  const refresh = await setting(KEYS.token);
  if (!refresh) throw new DriveError("Google Drive isn't connected. Connect it on the dashboard.");
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    cached = { token: t.access_token!, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 };
    return cached.token;
  } catch (e) {
    if (e instanceof DriveError && e.revoked) throw new DriveError("Google Drive access was removed or has expired. Connect Google Drive again on the dashboard.");
    throw e;
  }
}

/** Finishes connecting: swaps Google's code for a refresh token, remembers the account and makes the export folder. */
export async function connectDrive(code: string, redirect: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect });
  if (!t.refresh_token) throw new DriveError("Google didn't grant offline access. Try connecting again.");
  await save(KEYS.token, t.refresh_token);
  cached = { token: t.access_token!, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 };
  const about = await drive<{ user?: { emailAddress?: string } }>("/about?fields=user(emailAddress)");
  if (about.user?.emailAddress) await save(KEYS.account, about.user.emailAddress);
  await exportFolder();
}

export async function disconnectDrive() {
  const refresh = await setting(KEYS.token);
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => {});
  await db.setting.deleteMany({ where: { key: { in: Object.values(KEYS) } } });
  cached = null;
}

async function drive<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new DriveError(await driveMessage(res), false);
  return (res.status === 204 ? {} : await res.json()) as T;
}

async function driveMessage(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return `Google Drive: ${body?.error?.message ?? res.statusText ?? res.status}`;
}

/** True if the app's file or folder is still there and not in the bin. */
async function exists(id: string | null) {
  if (!id) return false;
  const res = await fetch(`${API}/files/${id}?fields=trashed`, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: "no-store" });
  if (res.status === 404) return false;
  if (!res.ok) throw new DriveError(await driveMessage(res));
  return !(await res.json()).trashed;
}

async function createFolder(name: string, parent?: string) {
  const f = await drive<{ id: string }>("/files?fields=id", { method: "POST", body: JSON.stringify({ name, mimeType: FOLDER_TYPE, ...(parent ? { parents: [parent] } : {}) }) });
  return f.id;
}

/** The top folder exports go into, made again if someone deleted it. Admins can rename or move it in Drive. */
async function exportFolder() {
  const id = await setting(KEYS.folder);
  if (await exists(id)) return id!;
  const made = await createFolder(DRIVE_FOLDER_NAME);
  await save(KEYS.folder, made);
  return made;
}

/** Uploads a file, or replaces the contents of `existing`, with a resumable upload so long recordings stream through. */
async function upload(meta: { name: string; mimeType: string; parents?: string[] }, body: ReadableStream<Uint8Array> | Uint8Array, size: number, existing?: string | null) {
  const start = await fetch(`${UPLOAD}/files${existing ? `/${existing}` : ""}?uploadType=resumable&fields=id`, {
    method: existing ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": meta.mimeType,
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify(existing ? { name: meta.name } : meta),
    cache: "no-store",
  });
  const session = start.headers.get("location");
  if (!start.ok || !session) throw new DriveError(await driveMessage(start));
  const res = await fetch(session, { method: "PUT", headers: { "Content-Type": meta.mimeType, "Content-Length": String(size) }, body, duplex: "half", cache: "no-store" } as RequestInit);
  if (!res.ok) throw new DriveError(await driveMessage(res));
  return ((await res.json()) as { id: string }).id;
}

function safeName(title: string) {
  return title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled job";
}

const running = new Set<string>();

/**
 * Copies one approved job to Drive: its folder, the recording (once) and the final transcript (replaced on every
 * approval, so a job approved again after changes has the latest one). Records the outcome on the job.
 */
export async function exportJob(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "SUBMITTED" || !job.approvedAt) return;
    const name = safeName(job.title);
    let media = job.driveMediaId;
    let transcript = job.driveTranscriptId;
    let folder: string;
    if (job.driveFolderId && (await exists(job.driveFolderId))) folder = job.driveFolderId;
    else {
      folder = await createFolder(job.project ? `${name} (${safeName(job.project)})` : name, await exportFolder());
      media = transcript = null;
    }
    await db.job.update({ where: { id: jobId }, data: { driveFolderId: folder, driveMediaId: media, driveTranscriptId: transcript } });

    if (!job.mediaRemovedAt && !(await exists(media))) {
      const res = await fetch(mediaUrl(job.mediaPath), { cache: "no-store" });
      if (!res.ok || !res.body) throw new DriveError("Couldn't read the recording from media storage.");
      const ext = job.mediaPath.includes(".") ? job.mediaPath.slice(job.mediaPath.lastIndexOf(".")) : "";
      const length = Number(res.headers.get("content-length"));
      const body = length > 0 ? res.body : new Uint8Array(await res.arrayBuffer());
      media = await upload({ name: name + ext, mimeType: job.mediaType, parents: [folder] }, body, length > 0 ? length : (body as Uint8Array).byteLength);
      await db.job.update({ where: { id: jobId }, data: { driveMediaId: media } });
    }

    const rich = job.transcriptFormat === "html";
    const file = new Uint8Array(rich ? await htmlToDocx(job.title, cleanDoc(job.editedTranscript)) : await textToDocx(job.title, job.editedTranscript));
    if (transcript && !(await exists(transcript))) transcript = null;
    transcript = await upload({ name: `${name}.docx`, mimeType: DOCX, parents: [folder] }, file, file.byteLength, transcript);
    await db.job.update({ where: { id: jobId }, data: { driveTranscriptId: transcript, driveExportedAt: new Date(), driveExportError: null } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Drive export of job ${jobId} failed:`, message);
    await db.job.update({ where: { id: jobId }, data: { driveExportError: message.slice(0, 500) } }).catch(() => {});
  } finally {
    running.delete(jobId);
  }
}

export function exportRunning(jobId: string) {
  return running.has(jobId);
}

/** Exports in the background once the response is sent, so approving stays quick. Does nothing until Drive is connected. */
export async function exportLater(jobIds: string[]) {
  if (!jobIds.length || !driveExportConfigured() || !(await setting(KEYS.token))) return false;
  after(async () => {
    for (const id of jobIds) await exportJob(id);
  });
  return true;
}

/** Approved jobs whose latest approval isn't in Drive yet. Approving clears driveExportedAt, so this covers re-approvals too. */
export function waitingForDrive() {
  return db.job.findMany({ where: { status: "SUBMITTED", approvedAt: { not: null }, driveExportedAt: null }, select: { id: true, driveExportError: true } });
}
