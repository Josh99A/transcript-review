type JobNow = { status: string; assigneeId: string | null; approvedAt: Date | null; reviewNote: string | null; submittedAt: Date | null } | null;

/** What a job is doing now, in the words its notifications use. */
export function jobNowLabel(job: JobNow, viewerId: string, admin: boolean): string {
  if (!job) return "The job was deleted";
  if (!admin && job.assigneeId !== viewerId) return "This job is no longer yours";
  if (job.status === "UNASSIGNED") return "Now unassigned";
  if (job.status === "SUBMITTED") return job.approvedAt ? "Now approved" : "Now waiting for review";
  if (job.reviewNote) return "Now sent back for changes";
  return admin ? "Now in progress, not submitted" : "Now in progress";
}

/**
 * Whether what a notification says still holds. Notices about one-off events (a payment, a job taken
 * away) stay true; notices about a job's state go out of date once the job moves on.
 */
export function isOutdated(kind: string | null, job: JobNow, hadJob: boolean, recipientId: string): boolean {
  if (!kind) return false;
  if (!job) return hadJob;
  switch (kind) {
    case "submitted":
      return !(job.status === "SUBMITTED" && !job.approvedAt);
    case "unsubmitted":
      return !(job.status === "ASSIGNED" && !job.submittedAt);
    case "approved":
      return !(job.status === "SUBMITTED" && job.approvedAt);
    case "sent-back":
      return !(job.status === "ASSIGNED" && job.reviewNote && job.assigneeId === recipientId);
    case "assigned":
      return job.assigneeId !== recipientId;
    // Left from when transcribers asked for jobs and an admin picked who got each one.
    case "requested":
      return job.status !== "UNASSIGNED";
    default:
      return false;
  }
}
