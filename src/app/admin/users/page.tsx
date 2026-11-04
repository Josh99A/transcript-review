import { Banknote, ClipboardCheck, Hourglass, Users, Wallet } from "lucide-react";
import PayProblems from "@/components/PayProblems";
import { payProblems } from "@/lib/payCheck";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, StatList, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser, expectedByUser } from "@/lib/earnings";
import { formatDate, formatUGX } from "@/lib/format";
import { NewUserButton, PayoutButton, ResetPasswordButton } from "./forms";
import LanguageSettings from "./LanguageSettings";
import ReportLinks from "@/components/ReportLinks";
import { getLanguages } from "@/lib/settings";

export const metadata: Metadata = { title: "Team & payments" };

export default async function UsersPage() {
  await requireAdmin();
  const [users, balances, problems, expected, payouts, jobCounts] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "desc" }, { name: "asc" }],
    }),
    balancesByUser(),
    payProblems(),
    expectedByUser(),
    db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
    db.job.groupBy({ by: ["assigneeId", "status"], _count: true }),
  ]);
  const jobsFor = (id: string, status: string) => jobCounts.find((c) => c.assigneeId === id && c.status === status)?._count ?? 0;
  const zero = { earned: 0, paid: 0, owed: 0, awaiting: 0, awaitingJobs: 0 };
  const transcribers = users.filter((u) => u.role === "USER");
  const admins = users.filter((u) => u.role === "ADMIN");
  const totals = transcribers.reduce(
    (t, u) => {
      const b = balances.get(u.id) ?? zero;
      return { earned: t.earned + b.earned, paid: t.paid + b.paid, owed: t.owed + b.owed, awaiting: t.awaiting + b.awaiting, awaitingJobs: t.awaitingJobs + b.awaitingJobs, expected: t.expected + (expected.get(u.id)?.total ?? 0) };
    },
    { ...zero, expected: 0 },
  );
  const inProgress = [...expected.values()].reduce((n, e) => n + e.jobs, 0);

  return (
    <>
      <PageHeader title="Team & payments" description="Add people, see what each person is owed and record payments." actions={<><ReportLinks /><NewUserButton /></>} />

      <PayProblems problems={problems} />
      {transcribers.some((u) => (balances.get(u.id)?.overpaid ?? 0) > 0) && (
        <section className="card my-6 p-5" aria-label="Overpayments">
          <h2 className="card-title">Payments above approved earnings</h2>
          <p className="mt-2 text-sm text-slate-600">Recorded payments are preserved. These amounts offset each person&apos;s future earnings; no further payment is due until their earnings exceed what they have already received.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {transcribers.filter((u) => (balances.get(u.id)?.overpaid ?? 0) > 0).map((u) => (
              <li key={u.id}>{u.name}: <span className="num font-semibold">{formatUGX(balances.get(u.id)!.overpaid)}</span> overpaid</li>
            ))}
          </ul>
        </section>
      )}
      <StatList
        stats={[
          { icon: Wallet, label: "Owed now", value: formatUGX(totals.owed), tone: "brand" },
          { icon: Hourglass, label: "In progress (expected)", value: formatUGX(totals.expected), tone: "amber", hint: `From ${inProgress} job${inProgress === 1 ? "" : "s"} not yet submitted` },
          { icon: ClipboardCheck, label: "Awaiting approval", value: formatUGX(totals.awaiting), tone: "slate", hint: `From ${totals.awaitingJobs} submitted job${totals.awaitingJobs === 1 ? "" : "s"}, not owed until you approve` },
          { icon: Banknote, label: "Paid out", value: formatUGX(totals.paid), tone: "emerald" },
          { icon: Users, label: "Transcribers", value: transcribers.length, tone: "slate" },
        ]}
      />

      <section className="card mt-6 overflow-hidden">
        <div className="card-header"><h2 className="card-title">Transcribers</h2></div>
        {transcribers.length === 0 ? (
          <EmptyState icon={Users} title="No transcribers yet" description="Add the people who'll correct transcripts. They'll sign in to see their jobs and earnings." action={<NewUserButton />} />
        ) : (
          <>
          <ul className="divide-y divide-slate-100 sm:hidden">
            {transcribers.map((u) => {
              const b = balances.get(u.id) ?? zero;
              return (
                <li key={u.id} className="space-y-3 px-4 py-4">
                  <PersonSummary user={u} owed={b.owed} />
                  <LanguageList languages={u.languages} />
                  <dl className="space-y-1.5 text-sm">
                    <Line label="Pay to"><PayTo user={u} /></Line>
                    <Line label="Jobs"><span className="num">{jobsFor(u.id, "SUBMITTED")} done · {jobsFor(u.id, "ASSIGNED")} in progress</span></Line>
                    <Line label="Awaiting approval"><AwaitingCell b={b} /></Line>
                    <Line label="Earned (approved)"><span className="num">{formatUGX(b.earned)}</span></Line>
                    <Line label="In progress (expected)"><ExpectedCell e={expected.get(u.id)} /></Line>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <PayoutButton userId={u.id} name={u.name} owed={b.owed} payTo={u.payPhone ? `${u.payPhone} (${u.payNetwork})` : null} />
                    <ResetPasswordButton userId={u.id} name={u.name} />
                    <Link href={`/admin/users/${u.id}/history`} className="btn-secondary btn-sm">View history</Link>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="table">
              <thead>
                <tr><th>Person</th><th>Pay to</th><th>Jobs</th><th className="text-right whitespace-nowrap" title="Pay from jobs in progress, not yet submitted">In progress<span className="block text-[10px] font-normal normal-case">expected</span></th><th className="text-right whitespace-nowrap" title="Submitted, not yet approved. Not owed until approved.">Awaiting<span className="block text-[10px] font-normal normal-case">approval</span></th><th className="text-right whitespace-nowrap">Earned<span className="block text-[10px] font-normal normal-case">approved</span></th><th className="text-right">Owed</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {transcribers.map((u) => {
                  const b = balances.get(u.id) ?? zero;
                  return (
                    <tr key={u.id}>
                      <td><UserCell name={u.name} sub={u.email} /><LanguageList languages={u.languages} className="mt-1.5 max-w-64" /></td>
                      <td><PayTo user={u} /></td>
                      <td className="num text-sm whitespace-nowrap text-slate-600">
                        <span className="block">{jobsFor(u.id, "SUBMITTED")} done</span>
                        <span className="block text-xs text-slate-500">{jobsFor(u.id, "ASSIGNED")} in progress</span>
                      </td>
                      <td className="text-right whitespace-nowrap"><ExpectedCell e={expected.get(u.id)} /></td>
                      <td className="text-right whitespace-nowrap"><AwaitingCell b={b} /></td>
                      <td className="num text-right">{formatUGX(b.earned)}</td>
                      <td className={`num text-right font-semibold ${b.owed > 0 ? "text-slate-900" : "text-slate-400"}`}>{formatUGX(b.owed)}</td>
                      <td >
                        <div className="flex items-center justify-end gap-1">
                          <PayoutButton userId={u.id} name={u.name} owed={b.owed} payTo={u.payPhone ? `${u.payPhone} (${u.payNetwork})` : null} />
                          <ResetPasswordButton userId={u.id} name={u.name} />
                          <Link href={`/admin/users/${u.id}/history`} className="btn-secondary btn-sm">View history</Link>
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

      <LanguageSettings languages={await getLanguages()} />

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
                <Link href={`/admin/users/${u.id}/history`} className="btn-secondary btn-sm">View history</Link>
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

function ExpectedCell({ e }: { e?: { jobs: number; transcriptPay: number; total: number } }) {
  return (
    <span className="num">
      <span className={e?.total ? "text-slate-900" : "text-slate-400"}>{formatUGX(e?.total ?? 0)}</span>
      {e && e.jobs > 0 && <span className="block text-xs text-slate-500">{e.jobs} job{e.jobs === 1 ? "" : "s"} · {formatUGX(e.transcriptPay)}</span>}
    </span>
  );
}

function AwaitingCell({ b }: { b: { awaiting: number; awaitingJobs: number } }) {
  return (
    <span className="num">
      <span className={b.awaiting ? "text-slate-900" : "text-slate-400"}>{formatUGX(b.awaiting)}</span>
      {b.awaitingJobs > 0 && <span className="block text-xs text-slate-500">{b.awaitingJobs} to review</span>}
    </span>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-slate-900">{children}</dd>
    </div>
  );
}

function LanguageList({ languages, className = "" }: { languages: string[]; className?: string }) {
  if (!languages.length) return <p className={`text-xs text-slate-400 ${className}`}>No languages listed</p>;
  return (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label="Languages">
      {languages.map((l) => <li key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{l}</li>)}
    </ul>
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
