import { CalendarClock } from "lucide-react";
import { daysUntil, formatPayDate, formatUGX } from "@/lib/format";

/** Tells a transcriber or referrer when they'll next be paid and how much is due. */
export default function PayDateBanner({ payDate, owed, detail }: { payDate: string | null; owed: number; detail?: React.ReactNode }) {
  if (!payDate) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
        <CalendarClock className="size-5 shrink-0 text-slate-400" />
        The next pay date hasn&apos;t been set yet. You&apos;ll see it here once an admin sets it.
      </div>
    );
  }
  const days = daysUntil(payDate);
  const when = days > 1 ? `in ${days} days` : days === 1 ? "tomorrow" : days === 0 ? "today" : "pay day has passed";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-600/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
        <CalendarClock className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-brand-900">
          Next pay date: {formatPayDate(payDate)} <span className="font-normal text-brand-700">({when})</span>
        </div>
        <div className="text-xs text-brand-700">{detail ?? "Everything you've earned and not yet been paid is paid on this date."}</div>
      </div>
      <div className="text-right">
        <div className="text-xs text-brand-700">Due to you</div>
        <div className="num text-lg font-semibold text-brand-900">{formatUGX(owed)}</div>
      </div>
    </div>
  );
}
