const styles = {
  UNASSIGNED: { cls: "bg-slate-100 text-slate-700 ring-slate-500/10", dot: "bg-slate-400", label: "Unassigned" },
  ASSIGNED: { cls: "bg-amber-50 text-amber-800 ring-amber-600/20", dot: "bg-amber-500", label: "In progress" },
  SUBMITTED: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500", label: "Submitted" },
} as const;

export const STATUS_LABELS = {
  UNASSIGNED: styles.UNASSIGNED.label,
  ASSIGNED: styles.ASSIGNED.label,
  SUBMITTED: styles.SUBMITTED.label,
};

export default function StatusBadge({ status }: { status: keyof typeof styles }) {
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
