import { Banknote, Clock, UserPlus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import PayDateBanner from "@/components/PayDateBanner";
import PaymentDetails from "@/components/PaymentDetails";
import { EmptyState, PageHeader, StatCard, UserCell } from "@/components/ui";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { balanceFor } from "@/lib/earnings";
import { formatDate, formatHours, formatUGX } from "@/lib/format";
import { REFERRAL_RATE_PER_HOUR_UGX, referralPayFor } from "@/lib/pay";
import { getNextPayDate } from "@/lib/settings";

export const metadata: Metadata = { title: "My referrals" };

export default async function ReferralsPage() {
  // Referrers, and transcribers who referred someone.
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin");
  const [referrals, credited, payouts, balance, payDate] = await Promise.all([
    db.user.findMany({ where: { referredById: user.id }, orderBy: { createdAt: "desc" } }),
    // Work credited to this referrer, per transcriber.
    db.earning.groupBy({ by: ["userId", "customRate"], where: { referrerId: user.id }, _sum: { seconds: true, amount: true }, _count: true }),
    db.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    balanceFor(user.id),
    getNextPayDate(),
  ]);
  // Per transcriber: jobs, time, and what this referrer earned from them (50% of their pay).
  const creditFor = (id: string) => {
    const rows = credited.filter((c) => c.userId === id);
    if (!rows.length) return undefined;
    const usual = rows.find((c) => !c.customRate)?._sum.seconds ?? 0;
    const custom = rows.find((c) => c.customRate)?._sum.amount ?? 0;
    return { _count: rows.reduce((n, c) => n + c._count, 0), _sum: { seconds: rows.reduce((n, c) => n + (c._sum.seconds ?? 0), 0) }, pay: referralPayFor(usual, custom) };
  };
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hi ${firstName}`}
        description={`You earn half of what the people you referred are paid: ${formatUGX(REFERRAL_RATE_PER_HOUR_UGX)} for every hour of transcript at the usual rate.`}
      />
      <div className="mb-6">
        <PayDateBanner payDate={payDate} owed={balance.owed} detail={user.role === "USER" ? "Your referral earnings are paid together with your transcription pay." : "Everything you've earned from referrals and not yet been paid is paid on this date."} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={UserPlus} label="People referred" value={referrals.length} tone="brand" />
        <StatCard icon={Clock} label="Referral earnings" value={formatUGX(balance.referralPay)} tone="emerald" hint={`${formatHours(balance.referralSeconds)} of transcripts submitted`} />
        <StatCard icon={Banknote} label="Paid to you" value={formatUGX(balance.paid)} tone="slate" />
        <StatCard icon={Wallet} label="Waiting to be paid" value={formatUGX(balance.owed)} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="card h-fit overflow-hidden">
          <div className="card-header"><h2 className="card-title">People you referred</h2></div>
          {referrals.length === 0 ? (
            <EmptyState icon={UserPlus} title="No referrals yet" description="When an admin adds a transcriber you brought in, they'll appear here." />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="table table-stack">
                <thead><tr><th>Transcriber</th><th>Joined</th><th>Submitted</th><th className="text-right">You earned</th></tr></thead>
                <tbody>
                  {referrals.map((r) => {
                    const c = creditFor(r.id);
                    const seconds = c?._sum.seconds ?? 0;
                    return (
                      <tr key={r.id}>
                        <td><UserCell name={r.name} sub={`${c?._count ?? 0} transcript${c?._count === 1 ? "" : "s"} submitted`} /></td>
                        <td data-label="Joined" className="whitespace-nowrap text-slate-600">{formatDate(r.createdAt)}</td>
                        <td data-label="Submitted" className="num whitespace-nowrap text-slate-600">{seconds ? formatHours(seconds) : <span className="text-slate-400">Nothing yet</span>}</td>
                        <td data-label="You earned" className={`num text-right font-medium ${seconds ? "text-emerald-700" : "text-slate-400"}`}>{formatUGX(c?.pay ?? 0)}</td>
                      </tr>
                    );
                  })}
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
            <EmptyState icon={Banknote} title="No payments yet" description="Payments show up here after each pay date." />
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
