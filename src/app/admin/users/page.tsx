import { Banknote, HandCoins, Hourglass, Users, Wallet } from "lucide-react";
import PayProblems from "@/components/PayProblems";
import { payProblems } from "@/lib/payCheck";
import type { Metadata } from "next";
import { EmptyState, PageHeader, StatList, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser, expectedByUser } from "@/lib/earnings";
import { formatDate, formatHours, formatUGX } from "@/lib/format";
import { REFERRAL_RATE_PER_HOUR_UGX } from "@/lib/pay";
import { NewUserButton, PayoutButton, ReferrerSelect, ResetPasswordButton } from "./forms";

export const metadata: Metadata = { title: "Team & payments" };

export default async function UsersPage() {
  await requireAdmin();
  const [users, balances, problems, expected, payouts, jobCounts] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "desc" }, { name: "asc" }],
      include: { _count: { select: { referrals: true } } },
    }),
    balancesByUser(),
    payProblems(),
    expectedByUser(),
    db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
    db.job.groupBy({ by: ["assigneeId", "status"], _count: true }),
  ]);
  const jobsFor = (id: string, status: string) => jobCounts.find((c) => c.assigneeId === id && c.status === status)?._count ?? 0;
  const zero = { earned: 0, paid: 0, owed: 0 };
  const transcribers = users.filter((u) => u.role === "USER");
  const referrers = users.filter((u) => u.role === "REFERRER");
  const admins = users.filter((u) => u.role === "ADMIN");
  // Transcribers can refer people too; their referral pay joins their transcriber balance.
  const referrerOptions = [...referrers.map((r) => ({ id: r.id, name: r.name })), ...transcribers.map((t) => ({ id: t.id, name: `${t.name} (transcriber)` }))];
  const optionsFor = (id: string) => referrerOptions.filter((o) => o.id !== id);
  const referrerList = [...referrers, ...transcribers.filter((t) => t._count.referrals > 0)];
  const fromReferrals = (id: string) => balances.get(id)?.referralPay ?? 0;
  const totals = [...transcribers, ...referrers].reduce(
    (t, u) => {
      const b = balances.get(u.id) ?? zero;
      return { earned: t.earned + b.earned, paid: t.paid + b.paid, owed: t.owed + b.owed, expected: t.expected + (expected.get(u.id)?.total ?? 0) };
    },
    { ...zero, expected: 0 },
  );
  const inProgress = [...expected.values()].reduce((n, e) => n + e.jobs, 0);

  return (
    <>
      <PageHeader title="Team & payments" description="Add people, see what each person is owed and record payments." actions={<NewUserButton referrers={referrerOptions} />} />

      <PayProblems problems={problems} />
      <StatList
        stats={[
          { icon: Wallet, label: "Owed now", value: formatUGX(totals.owed), tone: "brand" },
          { icon: Hourglass, label: "In progress (expected)", value: formatUGX(totals.expected), tone: "amber", hint: `From ${inProgress} job${inProgress === 1 ? "" : "s"} not yet submitted` },
          { icon: Banknote, label: "Paid out", value: formatUGX(totals.paid), tone: "emerald" },
          { icon: Users, label: "Transcribers", value: transcribers.length, tone: "slate", hint: `${referrers.length} referrer${referrers.length === 1 ? "" : "s"}` },
        ]}
      />

      <section className="card mt-6 overflow-hidden">
        <div className="card-header"><h2 className="card-title">Transcribers</h2></div>
        {transcribers.length === 0 ? (
          <EmptyState icon={Users} title="No transcribers yet" description="Add the people who'll correct transcripts. They'll sign in to see their jobs and earnings." action={<NewUserButton referrers={referrerOptions} />} />
        ) : (
          <>
          <ul className="divide-y divide-slate-100 sm:hidden">
            {transcribers.map((u) => {
              const b = balances.get(u.id) ?? zero;
              return (
                <li key={u.id} className="space-y-3 px-4 py-4">
                  <PersonSummary user={u} owed={b.owed} />
                  <dl className="space-y-1.5 text-sm">
                    <Line label="Pay to"><PayTo user={u} /></Line>
                    <Line label="Jobs"><span className="num">{jobsFor(u.id, "SUBMITTED")} done · {jobsFor(u.id, "ASSIGNED")} in progress</span></Line>
                    <Line label="Earned"><span className="num">{formatUGX(b.earned)}{fromReferrals(u.id) > 0 && <span className="block text-xs text-slate-500">incl. {formatUGX(fromReferrals(u.id))} from referrals</span>}</span></Line>
                    <Line label="In progress (expected)"><ExpectedCell e={expected.get(u.id)} credited={jobsFor(u.id, "ASSIGNED") - (expected.get(u.id)?.jobs ?? 0)} /></Line>
                  </dl>
                  <div>
                    <div className="mb-1 text-xs text-slate-500">Referred by</div>
                    <ReferrerSelect userId={u.id} current={u.referredById} referrers={optionsFor(u.id)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PayoutButton userId={u.id} name={u.name} owed={b.owed} payTo={u.payPhone ? `${u.payPhone} (${u.payNetwork})` : null} />
                    <ResetPasswordButton userId={u.id} name={u.name} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="table">
              <thead>
                <tr><th>Person</th><th>Pay to</th><th>Jobs</th><th>Referred by</th><th className="text-right whitespace-nowrap" title="Pay from jobs in progress, not yet submitted">In progress<span className="block text-[10px] font-normal normal-case">expected</span></th><th className="text-right">Earned</th><th className="text-right">Owed</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {transcribers.map((u) => {
                  const b = balances.get(u.id) ?? zero;
                  return (
                    <tr key={u.id}>
                      <td><UserCell name={u.name} sub={u.email} /></td>
                      <td><PayTo user={u} /></td>
                      <td className="num text-sm whitespace-nowrap text-slate-600">
                        <span className="block">{jobsFor(u.id, "SUBMITTED")} done</span>
                        <span className="block text-xs text-slate-500">{jobsFor(u.id, "ASSIGNED")} in progress</span>
                      </td>
                      <td><ReferrerSelect userId={u.id} current={u.referredById} referrers={optionsFor(u.id)} /></td>
                      <td className="text-right whitespace-nowrap"><ExpectedCell e={expected.get(u.id)} credited={jobsFor(u.id, "ASSIGNED") - (expected.get(u.id)?.jobs ?? 0)} /></td>
                      <td className="num text-right">{formatUGX(b.earned)}{fromReferrals(u.id) > 0 && <span className="block text-xs text-slate-500">incl. {formatUGX(fromReferrals(u.id))} referrals</span>}</td>
                      <td className={`num text-right font-semibold ${b.owed > 0 ? "text-slate-900" : "text-slate-400"}`}>{formatUGX(b.owed)}</td>
                      <td >
                        <div className="flex items-center justify-end gap-1">
                          <PayoutButton userId={u.id} name={u.name} owed={b.owed} payTo={u.payPhone ? `${u.payPhone} (${u.payNetwork})` : null} />
                          <ResetPasswordButton userId={u.id} name={u.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="card-header"><h2 className="card-title">Referrers</h2><span className="text-xs text-slate-500">Earn half of what the people they referred are paid ({formatUGX(REFERRAL_RATE_PER_HOUR_UGX)} per hour at the usual rate)</span></div>
        {referrerList.length === 0 ? (
          <EmptyState icon={HandCoins} title="No referrers yet" description="Pick a referrer or another transcriber as “Referred by” on the transcribers they brought in." />
        ) : (
          <>
          <ul className="divide-y divide-slate-100 sm:hidden">
            {referrerList.map((u) => {
              const b = balances.get(u.id) ?? zero;
              const names = transcribers.filter((t) => t.referredById === u.id).map((t) => t.name);
              return (
                <li key={u.id} className="space-y-3 px-4 py-4">
                  {u.role === "USER" ? <UserCell name={u.name} sub="Transcriber · paid with their transcriber balance" /> : <PersonSummary user={u} owed={b.owed} />}
                  <dl className="space-y-1.5 text-sm">
                    {u.role !== "USER" && <Line label="Pay to"><PayTo user={u} /></Line>}
                    <Line label="Referred"><span className="num">{u._count.referrals} · {formatHours(balances.get(u.id)?.referralSeconds ?? 0)} submitted</span></Line>
                    <Line label={u.role === "USER" ? "From referrals" : "Earned"}><span className="num">{formatUGX(u.role === "USER" ? fromReferrals(u.id) : b.earned)}</span></Line>
                    <Line label="In progress (expected)"><span className="num">{formatUGX(expected.get(u.id)?.referralPay ?? 0)}</span></Line>
                    {u.role !== "USER" && <Line label="Paid"><span className="num">{formatUGX(b.paid)}</span></Line>}
                  </dl>
                  {names.length > 0 && <p className="text-xs break-words text-slate-500">{names.join(", ")}</p>}
                  {u.role !== "USER" && <div className="flex flex-wrap gap-2">
                    <PayoutButton userId={u.id} name={u.name} owed={b.owed} payTo={u.payPhone ? `${u.payPhone} (${u.payNetwork})` : null} />
                    <ResetPasswordButton userId={u.id} name={u.name} />
                  </div>}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="table">
              <thead>
                <tr><th>Referrer</th><th>Pay to</th><th>Referred</th><th className="text-right">Earned</th><th className="text-right">Paid</th><th className="text-right">Owed</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {referrerList.map((u) => {
                  const b = balances.get(u.id) ?? zero;
                  const names = transcribers.filter((t) => t.referredById === u.id).map((t) => t.name);
                  return (
                    <tr key={u.id}>
                      <td><UserCell name={u.name} sub={u.role === "USER" ? "Transcriber" : u.email} /></td>
                      <td>{u.role === "USER" ? <span className="text-sm text-slate-400">With transcriber pay</span> : <PayTo user={u} />}</td>
                      <td className="text-slate-600">
                        <div className="min-w-0">
                        <div className="num">{u._count.referrals} referred · {formatHours(balances.get(u.id)?.referralSeconds ?? 0)} submitted</div>
                        {names.length > 0 && <div className="max-w-xs truncate text-xs text-slate-500" title={names.join(", ")}>{names.join(", ")}</div>}
                        </div>
                      </td>
                      {u.role === "USER" ? (
                        <>
                          <td className="num text-right">{formatUGX(fromReferrals(u.id))}<RefExpected n={expected.get(u.id)?.referralPay ?? 0} /></td>
                          <td colSpan={3} className="text-right text-xs text-slate-500">Included in their transcriber balance above</td>
                        </>
                      ) : (
                        <>
                          <td className="num text-right">{formatUGX(b.earned)}<RefExpected n={expected.get(u.id)?.referralPay ?? 0} /></td>
                          <td className="num text-right text-slate-600">{formatUGX(b.paid)}</td>
                          <td className={`num text-right font-semibold ${b.owed > 0 ? "text-slate-900" : "text-slate-400"}`}>{formatUGX(b.owed)}</td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <PayoutButton userId={u.id} name={u.name} owed={b.owed} payTo={u.payPhone ? `${u.payPhone} (${u.payNetwork})` : null} />
                              <ResetPasswordButton userId={u.id} name={u.name} />
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card overflow-hidden">
          <div className="card-header"><h2 className="card-title">Payment history</h2></div>
          {payouts.length === 0 ? (
            <EmptyState icon={Banknote} title="No payments recorded" description="Use Record payment next to a person once you've paid them." />
          ) : (
            <>
            <ul className="divide-y divide-slate-100 sm:hidden">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{p.user.name}</div>
                    <div className="text-xs text-slate-500">{formatDate(p.createdAt)}{p.note ? ` · ${p.note}` : ""}</div>
                  </div>
                  <span className="num shrink-0 font-medium">{formatUGX(p.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="table">
                <thead><tr><th>Date</th><th>Person</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap text-slate-600">{formatDate(p.createdAt)}</td>
                      <td>{p.user.name}</td>
                      <td className="text-slate-500">{p.note ?? "—"}</td>
                      <td className="num text-right font-medium">{formatUGX(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
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

function PersonSummary({ user, owed }: { user: { name: string; email: string }; owed: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><UserCell name={user.name} sub={user.email} /></div>
      <div className="shrink-0 text-right">
        <div className="text-xs text-slate-500">Owed</div>
        <div className={`num font-semibold ${owed > 0 ? "text-slate-900" : "text-slate-400"}`}>{formatUGX(owed)}</div>
      </div>
    </div>
  );
}

function ExpectedCell({ e, credited }: { e?: { jobs: number; transcriptPay: number; referralPay: number; total: number }; credited: number }) {
  return (
    <span className="num">
      <span className={e?.total ? "text-slate-900" : "text-slate-400"}>{formatUGX(e?.total ?? 0)}</span>
      {e && e.jobs > 0 && <span className="block text-xs text-slate-500">{e.jobs} job{e.jobs === 1 ? "" : "s"} · {formatUGX(e.transcriptPay)}</span>}
      {e && e.referralPay > 0 && <span className="block text-xs text-slate-500">+ {formatUGX(e.referralPay)} referrals</span>}
      {credited > 0 && <span className="block text-xs text-slate-500">{credited} sent back, already in Earned</span>}
    </span>
  );
}

function RefExpected({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className="block text-xs font-normal text-slate-500">+ {formatUGX(n)} expected from jobs in progress</span>;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-slate-900">{children}</dd>
    </div>
  );
}

function PayTo({ user }: { user: { payPhone: string | null; payNetwork: string | null; payName: string | null } }) {
  if (!user.payPhone) return <span className="text-sm text-amber-700">Not added yet</span>;
  return (
    <div className="min-w-0">
      <div className="num text-sm whitespace-nowrap text-slate-900">{user.payPhone}</div>
      <div className="text-xs text-slate-500">{user.payNetwork}{user.payName ? ` · ${user.payName}` : ""}</div>
    </div>
  );
}
