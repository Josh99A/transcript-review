const styles = {
  UNASSIGNED: { cls: "bg-slate-100 text-slate-700 ring-slate-500/10", dot: "bg-slate-400", label: "Unassigned" },
  ASSIGNED: { cls: "bg-amber-50 text-amber-800 ring-amber-600/20", dot: "bg-amber-500", label: "In progress" },
  SUBMITTED: { cls: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-500", label: "Awaiting review" },
  CHANGES: { cls: "bg-orange-50 text-orange-800 ring-orange-600/20", dot: "bg-orange-500", label: "Changes requested" },
  APPROVED: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500", label: "Approved" },
} as const;

type BadgeStatus = keyof typeof styles;

/** Status to show for a job, including where it is in review. */
export function jobBadge(job: { status: "UNASSIGNED" | "ASSIGNED" | "SUBMITTED"; reviewNote: string | null; approvedAt: Date | null }): BadgeStatus {
  if (job.status === "SUBMITTED") return job.approvedAt ? "APPROVED" : "SUBMITTED";
  if (job.status === "ASSIGNED" && job.reviewNote) return "CHANGES";
  return job.status;
}

export const STATUS_LABELS = {
  UNASSIGNED: styles.UNASSIGNED.label,
  ASSIGNED: styles.ASSIGNED.label,
  SUBMITTED: styles.SUBMITTED.label,
};

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
