import "server-only";
import { db } from "./db";
import { type Email, sendEmails } from "./email";
import { formatDuration, formatUGX } from "./format";
import { creditAmount } from "./pay";

// Every transcriber is emailed when jobs go up on Find work, whatever languages they listed. Jobs posted close together (a batch
// of uploads, say) are gathered for a few minutes and go out as one email per person, not one per job.

const WAIT_MS = 3 * 60_000;
const MAX_LISTED = 15;

type Pending = { jobs: Map<string, string | null>; timer: ReturnType<typeof setTimeout> | null };
// Kept on globalThis so a reload in development doesn't lose what's waiting.
const pending: Pending = ((globalThis as { newJobAlerts?: Pending }).newJobAlerts ??= { jobs: new Map(), timer: null });

/** Queues an email about a job that's now on Find work. `except` is someone who shouldn't hear about it, like whoever just left it. */
export function announceJob(jobId: string, except?: string | null) {
  if (!process.env.RESEND_API_KEY?.trim()) return;
  pending.jobs.set(jobId, except ?? null);
  pending.timer ??= setTimeout(() => void flush(), WAIT_MS);
}

async function flush() {
  const queued = new Map(pending.jobs);
  pending.jobs.clear();
  pending.timer = null;
  try {
    // Only jobs still waiting on the board by now; anything taken or pulled in the meantime is left out.
    const [jobs, people] = await Promise.all([
      db.job.findMany({ where: { id: { in: [...queued.keys()] }, posted: true, status: "UNASSIGNED" }, orderBy: { createdAt: "asc" } }),
      db.user.findMany({ where: { role: "USER" }, select: { id: true, name: true, email: true } }),
    ]);
    if (!jobs.length) return;
    const emails: Email[] = [];
    for (const p of people) {
      const theirs = jobs.filter((j) => queued.get(j.id) !== p.id);
      if (!theirs.length) continue;
      const one = theirs.length === 1 ? theirs[0] : null;
      const listed = theirs.slice(0, MAX_LISTED);
      emails.push({
        to: p.email,
        name: p.name,
        subject: one ? `New job on Find work: ${one.title}` : `${theirs.length} new jobs on Find work`,
        body: `${one ? "A job" : "Jobs"} you can work on ${one ? "is" : "are"} waiting on Find work. The first person to take ${one ? "it gets it" : "each one gets it"}, so have a look soon.${
          theirs.length > MAX_LISTED ? ` Here are the first ${MAX_LISTED}; the rest are on Find work.` : ""
        }`,
        details: listed.map((j) => [
          j.title,
          [j.language, formatDuration(j.durationSeconds), formatUGX(creditAmount(j.durationSeconds, j, null)), j.deadline && `due ${j.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`]
            .filter(Boolean)
            .join(" · "),
        ]),
        href: "/board",
        button: "Open Find work",
      });
    }
    const error = emails.length ? await sendEmails(emails) : null;
    if (error) console.error("New job emails failed:", error);
  } catch (e) {
    console.error("New job emails failed", e);
  }
}
