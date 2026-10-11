const styles = {
  UNASSIGNED: "bg-slate-100 text-slate-700",
  ASSIGNED: "bg-amber-100 text-amber-800",
  SUBMITTED: "bg-emerald-100 text-emerald-800",
} as const;

const labels = { UNASSIGNED: "Unassigned", ASSIGNED: "In progress", SUBMITTED: "Submitted" } as const;

export default function StatusBadge({ status }: { status: keyof typeof styles }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}
