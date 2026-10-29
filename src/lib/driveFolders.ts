import { createHash } from "node:crypto";

type DriveRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
const FOLDER_TYPE = "application/vnd.google-apps.folder";

/** Organises exports without changing the IDs of folders or their contents. */
export function driveFolders(request: DriveRequest) {
  const pending = new Map<string, Promise<string>>();

  async function groupFolder(root: string, group: string | null): Promise<string> {
    // Ungrouped jobs remain directly inside Transcript exports.
    if (!group) return root;
    const key = createHash("sha256").update(group).digest("hex");
    const cacheKey = `${root}:${key}`;
    const underway = pending.get(cacheKey);
    if (underway) return underway;
    const creating = (async () => {
      const parent = root.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const query = new URLSearchParams({
        q: `'${parent}' in parents and trashed = false and mimeType = '${FOLDER_TYPE}' and appProperties has { key='transcriptGroup' and value='${key}' }`,
        fields: "files(id)",
        pageSize: "1",
      });
      const found = await request<{ files: { id: string }[] }>(`/files?${query}`);
      if (found.files.length) return found.files[0].id;
      const made = await request<{ id: string }>("/files?fields=id", {
        method: "POST",
        body: JSON.stringify({ name: group, mimeType: FOLDER_TYPE, parents: [root], appProperties: { transcriptGroup: key } }),
      });
      return made.id;
    })();
    pending.set(cacheKey, creating);
    try {
      return await creating;
    } finally {
      pending.delete(cacheKey);
    }
  }

  async function moveJobFolder(id: string, name: string, parent: string) {
    const folder = await request<{ parents?: string[] }>(`/files/${encodeURIComponent(id)}?fields=parents`);
    const parents = folder.parents ?? [];
    const query = new URLSearchParams({ fields: "id" });
    if (!parents.includes(parent)) query.set("addParents", parent);
    const old = parents.filter((p) => p !== parent);
    if (old.length) query.set("removeParents", old.join(","));
    await request(`/files/${encodeURIComponent(id)}?${query}`, { method: "PATCH", body: JSON.stringify({ name }) });
  }

  return { groupFolder, moveJobFolder };
}
