import { CircleCheck, Hourglass, Wallet } from "lucide-react";
import Link from "next/link";
import type { Balance, Expected } from "@/lib/earnings";
import { formatHours, formatUGX } from "@/lib/format";

/**
 * The three amounts a transcriber cares about, side by side, each saying what it counts so that
 * pay still to come from current jobs is never mistaken for pay already earned.
 */
export default function PayPicture({ expected, balance, earningsLink = true }: { expected: Expected; balance: Balance; earningsLink?: boolean }) {
  const items = [
    {
      icon: Hourglass,
      tone: "bg-amber-50 text-amber-600",
      label: "Expected from your current jobs",
      value: formatUGX(expected.total),
      note: expected.jobs
        ? `${expected.jobs} job${expected.jobs === 1 ? "" : "s"} you haven't submitted yet (${formatHours(expected.seconds)} of media). Not earned yet: it moves to Earned when you submit.`
        : "Nothing in progress. Pay from jobs you take on shows here until you submit them.",
      extra: expected.referralPay > 0 ? `Includes ${formatUGX(expected.referralPay)} from jobs people you referred are working on.` : null,
    },
    {
      icon: CircleCheck,
      tone: "bg-emerald-50 text-emerald-600",
      label: "Earned from submitted work",
      value: formatUGX(balance.earned),
      note: `Everything you've submitted so far (${formatHours(balance.seconds)}), including work still waiting for review.`,
      extra: balance.referralPay > 0 ? `Includes ${formatUGX(balance.referralPay)} from people you referred.` : null,
    },
    {
      icon: Wallet,
      tone: "bg-brand-50 text-brand-600",
      label: "Waiting to be paid",
      value: formatUGX(balance.owed),
      note: `What you've earned minus the ${formatUGX(balance.paid)} you've already been paid.`,
      extra: null,
      link: earningsLink,
    },
  ];
  return (
    <section aria-label="Your pay" className="card divide-y divide-slate-100 md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
      {items.map((i) => (
        <div key={i.label} className="flex gap-3 p-4 sm:p-5">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${i.tone}`}><i.icon className="size-5" aria-hidden /></span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700">{i.label}</div>
            <div className="num mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">{i.value}</div>
            <p className="mt-1 text-xs text-slate-500">{i.note}</p>
            {i.extra && <p className="mt-1 text-xs text-slate-500">{i.extra}</p>}
            {i.link && <Link href="/earnings" className="mt-1 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">View earnings</Link>}
          </div>
        </div>
      ))}
    </section>
  );
}
