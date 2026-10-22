import { FileX2, type LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1">
          <h1 className="title-wrap text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const STAT_TONES = {
  slate: "bg-slate-100 text-slate-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  brand: "bg-brand-50 text-brand-600",
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "slate",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="card flex flex-col items-start gap-3 p-4 sm:flex-row sm:gap-4 sm:p-5">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="w-full min-w-0">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="num mt-0.5 truncate text-xl font-semibold sm:text-2xl tracking-tight text-slate-900">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

export type Stat = { icon: LucideIcon; label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: keyof typeof STAT_TONES };

/**
 * Headline numbers in one flat card: a list of rows on phones, columns from sm up.
 * Used instead of a grid of separate cards, which some budget Android phones paint twice.
 */
export function StatList({ stats }: { stats: Stat[] }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" }[stats.length] ?? "sm:grid-cols-3";
  return (
    <div className={`card divide-y divide-slate-100 sm:grid sm:divide-y-0 ${cols}`}>
      {stats.map(({ icon: Icon, label, value, hint, tone = "slate" }) => (
        <div key={label} className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className={`hidden size-10 shrink-0 items-center justify-center rounded-lg sm:flex ${STAT_TONES[tone]}`}>
            <Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-500">{label}</div>
            {hint && <div className="text-xs text-slate-500 sm:hidden">{hint}</div>}
            <div className="num hidden truncate text-2xl font-semibold tracking-tight text-slate-900 sm:block">{value}</div>
            {hint && <div className="mt-0.5 hidden text-xs text-slate-500 sm:block">{hint}</div>}
          </div>
          <div className="num shrink-0 text-right text-lg font-semibold text-slate-900 sm:hidden">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-teal-100 text-teal-700",
];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizes[size]} ${AVATAR_COLORS[hash % AVATAR_COLORS.length]}`}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

export function UserCell({ name, sub }: { name: string; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} />
      <div className="min-w-0">
        <div className="truncate font-medium text-slate-900">{name}</div>
        {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

/** Shown in place of the player once an admin has removed a job's media file. */
export function MediaRemoved({ at }: { at: Date }) {
  return (
    <div className="card flex items-center gap-3 p-4 text-sm text-slate-600">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <FileX2 className="size-4.5" aria-hidden />
      </span>
      <span>
        The media file was removed on {at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} to save space. The transcript and pay records are kept.
      </span>
    </div>
  );
}
