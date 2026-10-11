import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDuration, formatUGX } from "@/lib/format";
import { RATE_PER_HOUR_UGX } from "@/lib/pay";

export default async function EarningsPage() {
  const user = await requireUser();
  const [earnings, payouts] = await Promise.all([
    db.earning.findMany({ where: { userId: user.id }, include: { job: true }, orderBy: { createdAt: "desc" } }),
    db.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const earned = earnings.reduce((s, e) => s + e.amount, 0);
  const paid = payouts.reduce((s, p) => s + p.amount, 0);
  const seconds = earnings.reduce((s, e) => s + e.job.durationSeconds, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><div className="text-sm text-slate-500">Total earned</div><div className="mt-1 text-2xl font-semibold">{formatUGX(earned)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Paid to you</div><div className="mt-1 text-2xl font-semibold">{formatUGX(paid)}</div></div>
        <div className="card border-indigo-200 bg-indigo-50"><div className="text-sm text-indigo-700">Still to be paid</div><div className="mt-1 text-2xl font-semibold text-indigo-900">{formatUGX(earned - paid)}</div></div>
      </div>
      <p className="text-sm text-slate-500">
        You&apos;re paid {formatUGX(RATE_PER_HOUR_UGX)} per hour of media, prorated by length. You&apos;ve completed {formatDuration(seconds)} so far.
      </p>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Completed jobs</h2>
        {earnings.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing yet. Pay appears here as soon as you submit a transcript.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Job</th><th>Length</th><th>Credited</th><th>Amount</th></tr></thead>
            <tbody>
              {earnings.map((e) => (
                <tr key={e.id}>
                  <td>{e.job.title}</td><td>{formatDuration(e.job.durationSeconds)}</td><td>{formatDate(e.createdAt)}</td><td>{formatUGX(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Payments received</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Date</th><th>Amount</th><th>Note</th></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}><td>{formatDate(p.createdAt)}</td><td>{formatUGX(p.amount)}</td><td>{p.note ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
