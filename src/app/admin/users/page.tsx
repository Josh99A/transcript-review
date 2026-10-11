import { Banknote, HandCoins, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader, StatCard, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatDate, formatHours, formatUGX } from "@/lib/format";
import { REFERRAL_RATE_PER_HOUR_UGX } from "@/lib/pay";
import { NewUserButton, PayoutButton, ReferrerSelect, ResetPasswordButton } from "./forms";

export const metadata: Metadata = { title: "Team & payments" };

export default async function UsersPage() {
  await requireAdmin();
  const [users, balances, payouts, jobCounts] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "desc" }, { name: "asc" }],
      include: { _count: { select: { referrals: true } } },
    }),
    balancesByUser(),
    db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
    db.job.groupBy({ by: ["assigneeId", "status"], _count: true }),
  ]);
  const jobsFor = (id: string, status: string) => jobCounts.find((c) => c.assigneeId === id && c.status === status)?._count ?? 0;
  const zero = { earned: 0, paid: 0, owed: 0 };
  const transcribers = users.filter((u) => u.role === "USER");
  const referrers = users.filter((u) => u.role === "REFERRER");
  const admins = users.filter((u) => u.role === "ADMIN");
  const referrerOptions = referrers.map((r) => ({ id: r.id, name: r.name }));
  const totals = [...transcribers, ...referrers].reduce(
    (t, u) => {
      const b = balances.get(u.id) ?? zero;
      return { earned: t.earned + b.earned, paid: t.paid + b.paid, owed: t.owed + b.owed };
    },
    { ...zero },
  );

  return (
    <>
      <PageHeader title="Team & payments" description="Add people, see what each person is owed and record payments." actions={<NewUserButton referrers={referrerOptions} />} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <StatCard icon={Wallet} label="Owed now" value={formatUGX(totals.owed)} tone="brand" />
        <StatCard icon={Banknote} label="Paid out" value={formatUGX(totals.paid)} tone="emerald" />
        <StatCard icon={Users} label="Transcribers" value={transcribers.length} tone="slate" hint={`${referrers.length} referrer${referrers.length === 1 ? "" : "s"}`} />
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="card-header"><h2 className="card-title">Transcribers</h2></div>
        {transcribers.length === 0 ? (
          <EmptyState icon={Users} title="No transcribers yet" description="Add the people who'll correct transcripts. They'll sign in to see their jobs and earnings." action={<NewUserButton referrers={referrerOptions} />} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="table table-stack">
              <thead>
                <tr><th>Person</th><th>Jobs</th><th>Referred by</th><th className="text-right">Earned</th><th className="text-right">Paid</th><th className="text-right">Owed</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {transcribers.map((u) => {
                  const b = balances.get(u.id) ?? zero;
                  return (
                    <tr key={u.id}>
                      <td><UserCell name={u.name} sub={u.email} /></td>
                      <td data-label="Jobs" className="num whitespace-nowrap text-slate-600">
                        {jobsFor(u.id, "ASSIGNED")} in progress · {jobsFor(u.id, "SUBMITTED")} done
                      </td>
                      <td data-label="Referred by"><ReferrerSelect userId={u.id} current={u.referredById} referrers={referrerOptions} /></td>
                      <td data-label="Earned" className="num text-right">{formatUGX(b.earned)}</td>
                      <td data-label="Paid" className="num text-right text-slate-600">{formatUGX(b.paid)}</td>
                      <td data-label="Owed" className={`num text-right font-semibold ${b.owed > 0 ? "text-slate-900" : "text-slate-400"}`}>{formatUGX(b.owed)}</td>
                      <td className="td-actions">
                        <div className="flex items-center justify-end gap-1">
                          <PayoutButton userId={u.id} name={u.name} owed={b.owed} />
                          <ResetPasswordButton userId={u.id} name={u.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="card-header"><h2 className="card-title">Referrers</h2><span className="text-xs text-slate-500">Earn {formatUGX(REFERRAL_RATE_PER_HOUR_UGX)} per hour of transcript submitted by the people they referred</span></div>
        {referrers.length === 0 ? (
          <EmptyState icon={HandCoins} title="No referrers yet" description="Add someone with the Referrer role, then pick them as “Referred by” on the transcribers they brought in." />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="table table-stack">
              <thead>
                <tr><th>Referrer</th><th>Referred</th><th className="text-right">Earned</th><th className="text-right">Paid</th><th className="text-right">Owed</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {referrers.map((u) => {
                  const b = balances.get(u.id) ?? zero;
                  const names = transcribers.filter((t) => t.referredById === u.id).map((t) => t.name);
                  return (
                    <tr key={u.id}>
                      <td><UserCell name={u.name} sub={u.email} /></td>
                      <td data-label="Referred" className="text-slate-600">
                        <div className="min-w-0">
                        <div className="num">{u._count.referrals} referred · {formatHours(balances.get(u.id)?.referralSeconds ?? 0)} submitted</div>
                        {names.length > 0 && <div className="max-w-xs truncate text-xs text-slate-500" title={names.join(", ")}>{names.join(", ")}</div>}
                        </div>
                      </td>
                      <td data-label="Earned" className="num text-right">{formatUGX(b.earned)}</td>
                      <td data-label="Paid" className="num text-right text-slate-600">{formatUGX(b.paid)}</td>
                      <td data-label="Owed" className={`num text-right font-semibold ${b.owed > 0 ? "text-slate-900" : "text-slate-400"}`}>{formatUGX(b.owed)}</td>
                      <td className="td-actions">
                        <div className="flex items-center justify-end gap-1">
                          <PayoutButton userId={u.id} name={u.name} owed={b.owed} />
                          <ResetPasswordButton userId={u.id} name={u.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card overflow-hidden">
          <div className="card-header"><h2 className="card-title">Payment history</h2></div>
          {payouts.length === 0 ? (
            <EmptyState icon={Banknote} title="No payments recorded" description="Use Record payment next to a person once you've paid them." />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="table table-stack">
                <thead><tr><th>Date</th><th>Person</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap text-slate-600">{formatDate(p.createdAt)}</td>
                      <td data-label="Person">{p.user.name}</td>
                      <td data-label="Note" className="text-slate-500">{p.note ?? "—"}</td>
                      <td data-label="Amount" className="num text-right font-medium">{formatUGX(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card h-fit">
          <div className="card-header"><h2 className="card-title">Admins</h2></div>
          <ul className="divide-y divide-slate-100">
            {admins.map((u) => (
              <li key={u.id} className="flex items-center gap-2 px-5 py-3">
                <div className="min-w-0 flex-1"><UserCell name={u.name} sub={u.email} /></div>
                <ResetPasswordButton userId={u.id} name={u.name} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
