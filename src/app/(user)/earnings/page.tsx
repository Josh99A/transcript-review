import { Banknote, CircleCheck, Clock, HandCoins, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import PayDateBanner from "@/components/PayDateBanner";
import PaymentDetails from "@/components/PaymentDetails";
import { requireRole } from "@/lib/auth";
import { balanceFor } from "@/lib/earnings";
import { getNextPayDate } from "@/lib/settings";
import { db } from "@/lib/db";
import { formatDate, formatDuration, formatHours, formatUGX } from "@/lib/format";
import { RATE_PER_HOUR_UGX } from "@/lib/pay";

export const metadata: Metadata = { title: "My earnings" };

export default async function EarningsPage() {
  const user = await requireRole("USER");
  const [earnings, payouts] = await Promise.all([
    db.earning.findMany({ where: { userId: user.id }, include: { job: true }, orderBy: { createdAt: "desc" } }),
    db.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const [balance, payDate] = await Promise.all([balanceFor(user.id), getNextPayDate()]);
  const { earned, owed, seconds, referralPay, referralSeconds } = balance;
  const paid = payouts.reduce((s, p) => s + p.amount, 0);
  const paidPct = earned ? Math.min(100, Math.round((paid / earned) * 100)) : 0;

  return (
    <>
      <PageHeader title="My earnings" description={`You earn ${formatUGX(RATE_PER_HOUR_UGX)} per hour of media, worked out on the total time of all your submitted transcripts. Fixed-price jobs pay their set price instead.`} />
      <div className="mb-6">
        <PayDateBanner payDate={payDate} owed={owed} detail={`Paid on your total of ${formatHours(seconds)} of transcribed media, minus what you've already been paid.`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 to-brand-900 p-6 text-white shadow-lg lg:col-span-1">
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm text-brand-100"><Wallet className="size-4" /> Waiting to be paid</div>
            <div className="num mt-2 text-4xl font-semibold tracking-tight">{formatUGX(owed)}</div>
            <div className="mt-6">
              <div className="flex justify-between text-xs text-brand-100">
                <span>Paid {formatUGX(paid)}</span>
                <span>{paidPct}% of earnings</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-emerald-300" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2">
          <StatCard icon={CircleCheck} label="Total earned" value={formatUGX(earned)} tone="emerald" hint={`${earnings.length} transcript${earnings.length === 1 ? "" : "s"} submitted`} />
          <StatCard icon={Clock} label="Media completed" value={formatHours(seconds)} tone="slate" hint={`${formatDuration(seconds)} in total`} />
          {(referralPay > 0 || referralSeconds > 0) && (
            <div className="col-span-2">
              <StatCard icon={HandCoins} label="From people you referred" value={formatUGX(referralPay)} tone="brand" hint={<><span className="num">{formatHours(referralSeconds)}</span> submitted by them · <Link href="/referrals" className="font-medium text-brand-600 hover:text-brand-700">See referrals</Link></>} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="card h-fit overflow-hidden">
          <div className="card-header"><h2 className="card-title">Earnings history</h2></div>
          {earnings.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing earned yet" description="Each transcript you submit adds its length to your total hours." action={<Link href="/jobs" className="btn-secondary">Go to my jobs</Link>} />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="table table-stack">
                <thead><tr><th>Job</th><th>Credited</th><th className="text-right">Adds</th></tr></thead>
                <tbody>
                  {earnings.map((e) => (
                    <tr key={e.id}>
                      <td className="font-medium text-slate-900">{e.job.title}</td>
                      <td data-label="Credited" className="whitespace-nowrap text-slate-600">{formatDate(e.createdAt)}</td>
                      <td data-label="Adds" className="num text-right font-medium text-emerald-700">{e.customRate ? `${formatUGX(e.amount)}` : `+${formatHours(e.seconds)}`}{e.customRate && <span className="block text-xs font-normal text-slate-400">special rate</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="h-fit space-y-6">
        <PaymentDetails details={user} />
        <section className="card overflow-hidden">
          <div className="card-header"><h2 className="card-title">Payments received</h2></div>
          {payouts.length === 0 ? (
            <EmptyState icon={Banknote} title="No payments yet" description="When an admin pays you, it shows up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Banknote className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="num text-sm font-medium text-slate-900">{formatUGX(p.amount)}</div>
                    <div className="truncate text-xs text-slate-500">{formatDate(p.createdAt)}{p.note ? ` · ${p.note}` : ""}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>
    </>
  );
}
