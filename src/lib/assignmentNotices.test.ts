import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { notifyAdminAssignment } from "./assignmentNotices";

type Mail = { to: string[]; subject: string; text: string; html: string };
const actor = { name: "Amina", email: "amina@example.invalid" };
const job = { id: "job-1", title: "Interview recording", assigneeId: "transcriber" };

// Prisma delegates expose methods through proxies rather than ordinary property descriptors.
function replaceMethod(t: TestContext, target: object, key: string, replacement: unknown) {
  const methods = target as Record<string, unknown>;
  const original = methods[key];
  methods[key] = replacement;
  t.after(() => { methods[key] = original; });
}

function setup(t: TestContext, email = true, failLookup = false) {
  const oldKey = process.env.RESEND_API_KEY;
  if (email) process.env.RESEND_API_KEY = "mock-resend-key-never-sent";
  else delete process.env.RESEND_API_KEY;
  t.after(() => {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  });
  const people = [
    { id: "admin-1", ...actor },
    { id: "admin-2", name: "Brian", email: "brian@example.invalid" },
    { id: "transcriber", name: "Caroline", email: "caroline@example.invalid" },
    { id: "previous", name: "David", email: "david@example.invalid" },
  ];
  replaceMethod(t, db.user, "findUnique", async ({ where }: { where: { id: string } }) => {
    if (failLookup) throw new Error("Database unavailable");
    return people.find((p) => p.id === where.id) ?? null;
  });
  replaceMethod(t, db.user, "findMany", async ({ where }: { where: { role?: string; id?: { in: string[] } } }) =>
    where.role === "ADMIN" ? people.slice(0, 2) : people.filter((p) => where.id?.in.includes(p.id)),
  );
  const notices: Prisma.NotificationCreateManyInput[] = [];
  replaceMethod(t, db.notification, "createMany", async ({ data }: { data: Prisma.NotificationCreateManyInput[] }) => {
    notices.push(...data);
    return { count: data.length };
  });
  const batches: Mail[][] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://api.resend.com/emails/batch");
    batches.push(JSON.parse(String(init?.body)));
    return Response.json({ data: [] });
  });
  return { notices, batches };
}

test("every admin gets an assignment notice and email identifying the assignee and acting admin", async (t) => {
  const { notices, batches } = setup(t);
  await notifyAdminAssignment(job, actor);
  assert.deepEqual(notices.map((n) => n.userId), ["admin-1", "admin-2"]);
  for (const notice of notices) {
    assert.equal(notice.title, "Job assigned: Interview recording");
    assert.match(notice.body!, /Amina \(amina@example.invalid\).*Caroline/);
    assert.equal(notice.href, "/admin/jobs/job-1");
    assert.equal(notice.jobId, "job-1");
    assert.equal(notice.kind, undefined);
  }
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].map((email) => email.to), [["amina@example.invalid"], ["brian@example.invalid"]]);
  for (const email of batches[0]) {
    assert.match(email.text, /Assigned to: Caroline \(caroline@example.invalid\)/);
    assert.match(email.text, /Assigned by: Amina \(amina@example.invalid\)/);
  }
});

test("reassignments include the previous transcriber in the admin notice and email", async (t) => {
  const { notices, batches } = setup(t);
  await notifyAdminAssignment(job, actor, "previous");
  assert.equal(notices[0].title, "Job reassigned: Interview recording");
  assert.match(notices[0].body!, /reassigned this job from David to Caroline/);
  assert.match(batches[0][0].text, /Previously assigned to: David \(david@example.invalid\)/);
});

test("transfers are identified separately from new assignments", async (t) => {
  const { notices, batches } = setup(t);
  await notifyAdminAssignment(job, actor, "previous", true);
  assert.equal(notices[0].title, "Job transferred: Interview recording");
  assert.match(notices[0].body!, /transferred this job from David to Caroline/);
  assert.match(batches[0][0].text, /Assigned by: Amina/);
});

test("in-app assignment notifications still work when email is not configured", async (t) => {
  const { notices, batches } = setup(t, false);
  await notifyAdminAssignment(job, actor);
  assert.equal(notices.length, 2);
  assert.equal(batches.length, 0);
});

test("unassigned jobs do not generate assignment messages", async (t) => {
  const { notices, batches } = setup(t);
  await notifyAdminAssignment({ ...job, assigneeId: null }, actor);
  assert.equal(notices.length, 0);
  assert.equal(batches.length, 0);
});

test("a notification lookup failure does not fail a completed assignment", async (t) => {
  const { notices, batches } = setup(t, true, true);
  const logged = t.mock.method(console, "error", () => {});
  await assert.doesNotReject(notifyAdminAssignment(job, actor));
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(notices.length, 0);
  assert.equal(batches.length, 0);
});
