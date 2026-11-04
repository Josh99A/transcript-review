import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { personalHistoryFor } from "@/lib/personalHistory";
import { formatDate, formatUGX } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Account history" };

export default async function AccountHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!await db.user.findUnique({ where: { id }, select: { id: true } })) notFound();
  const history = await personalHistoryFor(id);
  const download = `/api/admin/users/${encodeURIComponent(id)}/history`;
  const events = [
    ...history.earnings.map((e) => ({
      id: e.id, date: e.createdAt, type: "Job credit", description: e.job.title,
      detail: e.job.status === "SUBMITTED" ? e.job.approvedAt ? `Approved ${formatDate(e.job.approvedAt)}` : "Awaiting approval" : "Not approved",
      amount: e.amount, jobId: e.job.id,
    })),
    ...history.payments.map((p) => ({ id: p.id, date: p.createdAt, type: "Payment", description: p.note || "Recorded payment", detail: "Paid", amount: p.amount, jobId: null })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const adjustment = history.reconciliation;
  return (
    <>
      <Link href="/admin/users" className="mb-4 inline-block text-sm text-brand-600">Back to Team &amp; payments</Link>
      <PageHeader title={`${history.account.name}: account history`} description={history.account.email} actions={<>
        <a className="btn-secondary" href={`${download}?format=csv`}>Download CSV</a>
        <a className="btn-secondary" href={`${download}?format=json`}>Download JSON</a>
      </>} />
      <section className="card mb-6 p-5" aria-label="Current balance">
        <h2 className="card-title">Current balance</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries({ "Approved earnings": history.summary.approvedEarnings, "Recorded payments": history.summary.recordedPayments, "Amount owed": history.summary.owed, Overpaid: history.summary.overpaid, "Awaiting approval": history.summary.awaitingApproval }).map(([label, value]) => (
            <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="num mt-1 font-semibold">{formatUGX(value)}</dd></div>
          ))}
        </dl>
      </section>
      <section className="card mb-6 p-5" aria-label="Reconciliation history">
        <h2 className="card-title">Reconciliation history</h2>
        {adjustment ? <>
          <p className="mt-2 text-sm text-slate-600">Snapshot taken {formatDate(new Date(adjustment.adjustedAt))}. Recorded payments were preserved. These totals describe the adjustment date; current balances appear above.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries({ "Balance before adjustment": adjustment.balanceBeforeAdjustment, "Removed referral earnings": adjustment.removedReferralEarnings, "Transcription earnings": adjustment.transcriptionEarningsAtAdjustment, "Recorded payments": adjustment.recordedPaymentsAtAdjustment, "Owed after adjustment": adjustment.owedAfterAdjustment, "Overpaid after adjustment": adjustment.overpaidAfterAdjustment }).map(([label, value]) => (
              <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="num mt-1 font-semibold">{formatUGX(value)}</dd></div>
            ))}
          </dl>
        </> : <p className="mt-2 text-sm text-slate-600">No reconciliation snapshot is retained for this account.</p>}
      </section>
      <section className="card overflow-hidden" aria-label="Earnings and payment ledger">
        <div className="card-header"><h2 className="card-title">Earnings and payment ledger</h2></div>
        {events.length ? <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Date</th><th>Record</th><th>Description</th><th>Status</th><th className="text-right">Amount</th><th>Reference</th></tr></thead>
          <tbody>{events.map((event) => <tr key={`${event.type}-${event.id}`}>
            <td className="whitespace-nowrap">{formatDate(event.date)}</td><td>{event.type}</td>
            <td>{event.jobId ? <Link href={`/admin/jobs/${event.jobId}`} className="text-brand-600">{event.description}</Link> : event.description}</td>
            <td>{event.detail}</td><td className="num whitespace-nowrap text-right">{formatUGX(event.amount)}</td><td className="break-all text-xs text-slate-500">{event.id}</td>
          </tr>)}</tbody>
        </table></div> : <p className="p-5 text-sm text-slate-600">No earnings or payments recorded.</p>}
      </section>
      <div className="mt-4 space-y-1 text-xs text-slate-500">{history.notes.map((note) => <p key={note}>{note}</p>)}</div>
    </>
  );
}
