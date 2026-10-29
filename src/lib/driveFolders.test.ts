import assert from "node:assert/strict";
import { test } from "node:test";
import { driveFolders } from "./driveFolders";

type Call = { url: URL; init: RequestInit };
function fakeDrive() {
  const calls: Call[] = [];
  const groups: { id: string; name: string; parents: string[]; appProperties: { transcriptGroup: string } }[] = [];
  const parents = new Map<string, string[]>();
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(`https://drive.test${path}`);
    calls.push({ url, init });
    if (url.searchParams.has("q")) {
      const q = url.searchParams.get("q")!;
      const key = q.match(/value='([a-f0-9]+)'/)?.[1];
      return { files: groups.filter((group) => group.appProperties.transcriptGroup === key && q.includes(`'${group.parents[0]}' in parents`)) } as T;
    }
    if (init.method === "POST") {
      const group = { ...JSON.parse(String(init.body)), id: `group-${groups.length + 1}` };
      groups.push(group);
      return { id: group.id } as T;
    }
    const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
    if (init.method === "PATCH") {
      const removed = (url.searchParams.get("removeParents") ?? "").split(",");
      const next = (parents.get(id) ?? []).filter((parent) => !removed.includes(parent));
      const added = url.searchParams.get("addParents");
      if (added) next.push(added);
      parents.set(id, next);
      return { id } as T;
    }
    return { parents: parents.get(id) ?? [] } as T;
  }
  return { request, calls, groups, parents };
}

test("ungrouped jobs stay at the export root without creating a folder", async () => {
  const api = fakeDrive();
  assert.equal(await driveFolders(api.request).groupFolder("exports", null), "exports");
  assert.equal(api.calls.length, 0);
});

test("jobs in one group share a folder, including after an application restart", async () => {
  const api = fakeDrive();
  const folders = driveFolders(api.request);
  const first = await folders.groupFolder("exports", "Kampala survey");
  assert.equal(await folders.groupFolder("exports", "Kampala survey"), first);
  assert.equal(await driveFolders(api.request).groupFolder("exports", "Kampala survey"), first);
  assert.equal(api.groups.length, 1);
  assert.equal(api.groups[0].name, "Kampala survey");
  assert.deepEqual(api.groups[0].parents, ["exports"]);
  assert.match(api.calls[0].url.searchParams.get("q")!, /trashed = false/);
});

test("concurrent exports into a new group create only one shared folder", async () => {
  const api = fakeDrive();
  const folders = driveFolders(api.request);
  const ids = await Promise.all(Array.from({ length: 5 }, () => folders.groupFolder("exports", "Research")));
  assert.equal(new Set(ids).size, 1);
  assert.equal(api.groups.length, 1);
});

test("group identity and export root are both respected", async () => {
  const api = fakeDrive();
  const folders = driveFolders(api.request);
  const first = await folders.groupFolder("exports", "A/B");
  const second = await folders.groupFolder("exports", "A B");
  const third = await folders.groupFolder("new-exports", "A/B");
  assert.equal(new Set([first, second, third]).size, 3);
  assert.equal(api.groups[0].name, "A/B");
  assert.notEqual(api.groups[0].appProperties.transcriptGroup, api.groups[1].appProperties.transcriptGroup);
});

test("deleted group folders are recreated on the next export", async () => {
  const api = fakeDrive();
  const folders = driveFolders(api.request);
  await folders.groupFolder("exports", "Interviews");
  api.groups.splice(0);
  await folders.groupFolder("exports", "Interviews");
  assert.equal(api.calls.filter((call) => call.init.method === "POST").length, 2);
});

test("group names with quotes and query syntax remain names rather than Drive query expressions", async () => {
  const api = fakeDrive();
  const name = "O'Brien \\ interviews ' or trashed = true";
  await driveFolders(api.request).groupFolder("exports", name);
  assert.equal(api.groups[0].name, name);
  assert.equal(api.calls[0].url.searchParams.get("q")!.includes(name), false);
});

test("a failed Drive lookup does not create a duplicate or poison retries", async () => {
  const api = fakeDrive();
  let fail = true;
  const folders = driveFolders(async <T,>(path: string, init?: RequestInit) => {
    if (fail) throw new Error("Drive unavailable");
    return api.request<T>(path, init);
  });
  await assert.rejects(folders.groupFolder("exports", "Interviews"), /Drive unavailable/);
  assert.equal(api.groups.length, 0);
  fail = false;
  await folders.groupFolder("exports", "Interviews");
  assert.equal(api.groups.length, 1);
});

test("moving a job reuses its folder ID and changes the parent without touching files", async () => {
  const api = fakeDrive();
  api.parents.set("existing-job", ["old-group"]);
  await driveFolders(api.request).moveJobFolder("existing-job", "Updated job", "new-group");
  assert.deepEqual(api.parents.get("existing-job"), ["new-group"]);
  const patch = api.calls.find((call) => call.init.method === "PATCH")!;
  assert.equal(patch.url.pathname, "/files/existing-job");
  assert.equal(patch.url.searchParams.get("removeParents"), "old-group");
  assert.deepEqual(JSON.parse(String(patch.init.body)), { name: "Updated job" });
  assert.equal(api.calls.some((call) => call.init.method === "POST" || call.init.method === "DELETE"), false);
});

test("ungrouping moves the existing job folder back to the root", async () => {
  const api = fakeDrive();
  api.parents.set("job", ["group"]);
  const folders = driveFolders(api.request);
  await folders.moveJobFolder("job", "Job", await folders.groupFolder("exports", null));
  assert.deepEqual(api.parents.get("job"), ["exports"]);
});

test("re-exporting a job in the right group renames it without redundant parent changes", async () => {
  const api = fakeDrive();
  api.parents.set("job", ["group"]);
  await driveFolders(api.request).moveJobFolder("job", "New title", "group");
  const patch = api.calls.find((call) => call.init.method === "PATCH")!;
  assert.equal(patch.url.searchParams.has("addParents"), false);
  assert.equal(patch.url.searchParams.has("removeParents"), false);
  assert.deepEqual(api.parents.get("job"), ["group"]);
});
