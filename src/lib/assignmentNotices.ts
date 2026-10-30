import "server-only";
import { db } from "./db";
import { notifyAdmins } from "./notify";

type AssignmentJob = { id: string; title: string; assigneeId: string | null };
type Admin = { name: string; email: string };

/** Announces a completed admin assignment, including its actor, to every admin. */
export async function notifyAdminAssignment(job: AssignmentJob, admin: Admin, previousId?: string | null, transfer = false) {
  if (!job.assigneeId) return;
  try {
    const [assignee, previous] = await Promise.all([
      db.user.findUnique({ where: { id: job.assigneeId }, select: { name: true, email: true } }),
      previousId ? db.user.findUnique({ where: { id: previousId }, select: { name: true, email: true } }) : null,
    ]);
    if (!assignee) return;
    const action = transfer ? "transferred" : previousId ? "reassigned" : "assigned";
    await notifyAdmins({
      title: `Job ${action}: ${job.title}`,
      body: `${admin.name} (${admin.email}) ${action} this job${previous ? ` from ${previous.name}` : ""} to ${assignee.name}.`,
      href: `/admin/jobs/${job.id}`,
      jobId: job.id,
      // This records an event, rather than the current assignee's state. Leave kind unset so
      // settleNotices doesn't mark an admin's notice outdated because they aren't the assignee.
      email: true,
      details: [
        ["Job", job.title],
        ["Assigned to", `${assignee.name} (${assignee.email})`],
        ["Assigned by", `${admin.name} (${admin.email})`],
        ...(previous ? [["Previously assigned to", `${previous.name} (${previous.email})`] as [string, string]] : []),
      ],
    });
  } catch (error) {
    // Notification delivery must not turn a successful assignment into a failed request.
    console.error("Admin assignment notification failed", error);
  }
}
