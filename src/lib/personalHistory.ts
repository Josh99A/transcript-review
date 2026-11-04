import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { balancesByUser } from "./earnings";

const auditSchema = z.object({
  createdAt: z.string(),
  balances: z.array(z.object({
    userId: z.string(),
    transcriptionEarned: z.number(),
    removedReferralEarned: z.number(),
    paid: z.number(),
    previousBalance: z.number(),
    amountOwed: z.number(),
    overpaid: z.number(),
  })),
});

/** Export only this person's records, from one consistent database snapshot. */
export async function personalHistoryFor(userId: string, client: PrismaClient = db) {
  return client.$transaction(async (tx) => {
    const [account, earnings, payments, balances, audit] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, createdAt: true, languages: true, payNetwork: true, payPhone: true, payName: true },
      }),
      tx.earning.findMany({
        where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true, amount: true, seconds: true, customRate: true, lockedRate: true, createdAt: true,
          job: { select: { id: true, title: true, project: true, status: true, submittedAt: true, approvedAt: true, ratePerHour: true, fixedPay: true } },
        },
      }),
      tx.payout.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, amount: true, note: true, createdAt: true } }),
      balancesByUser(tx, userId),
      tx.setting.findUnique({ where: { key: "audit:2026-11-04-remove-referrals" }, select: { value: true } }),
    ]);
    // The audit contains everyone. Whitelist only the requesting person's financial totals.
    const snapshot = audit ? auditSchema.parse(JSON.parse(audit.value)) : null;
    const prior = snapshot?.balances.find((b) => b.userId === userId);
    const balance = balances.get(userId);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      currency: "UGX",
      account,
      summary: {
        approvedEarnings: balance?.earned ?? 0,
        recordedPayments: balance?.paid ?? 0,
        owed: balance?.owed ?? 0,
        overpaid: balance?.overpaid ?? 0,
        awaitingApproval: balance?.awaiting ?? 0,
      },
      reconciliation: prior && snapshot ? {
        adjustedAt: snapshot.createdAt,
        transcriptionEarningsAtAdjustment: prior.transcriptionEarned,
        removedReferralEarnings: prior.removedReferralEarned,
        recordedPaymentsAtAdjustment: prior.paid,
        balanceBeforeAdjustment: prior.previousBalance,
        owedAfterAdjustment: prior.amountOwed,
        overpaidAfterAdjustment: prior.overpaid,
      } : null,
      earnings,
      payments,
      notes: [
        "This export contains the historical records currently retained for your account. Deleted records and earlier edits cannot be reconstructed.",
        "Only approved jobs count toward earnings. Usual hourly pay is rounded on cumulative time at each locked rate, so individual credits may sum differently.",
        "Reconciliation totals are a snapshot at adjustment time. Recorded payments are preserved; overpayments offset future earnings.",
      ],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export type PersonalHistory = Awaited<ReturnType<typeof personalHistoryFor>>;

/** Protect text cells against spreadsheet formulas, including formulas after leading whitespace. */
function cell(value: string | number | null): string {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^\s*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function personalHistoryCsv(history: PersonalHistory): string {
  type Row = (string | number | null)[];
  const rows: Row[] = [["Record type", "Date", "Reference", "Description", "Status", "Seconds", "Hourly rate (UGX)", "Fixed price (UGX)", "Amount (UGX)", "Note"]];
  rows.push(["Account", history.account.createdAt.toISOString(), history.account.id, history.account.name, "", "", "", "", "", history.account.email]);
  for (const [key, value] of Object.entries(history.summary)) rows.push(["Summary", history.generatedAt, key, key, "", "", "", "", value, ""]);
  if (history.reconciliation) {
    for (const [key, value] of Object.entries(history.reconciliation)) {
      if (typeof value === "number") rows.push(["Reconciliation", history.reconciliation.adjustedAt, key, key, "", "", "", "", value, ""]);
    }
  }
  for (const e of history.earnings) rows.push([
    "Earning", e.createdAt.toISOString(), e.id, e.job.title,
    e.job.status === "SUBMITTED" ? e.job.approvedAt ? "Approved" : "Awaiting approval" : "Not approved",
    e.seconds, e.lockedRate ?? e.job.ratePerHour, e.job.fixedPay, e.amount,
    `Job: ${e.job.id}${e.job.project ? `; Project: ${e.job.project}` : ""}`,
  ]);
  for (const p of history.payments) rows.push(["Payment", p.createdAt.toISOString(), p.id, "Recorded payment", "Paid", "", "", "", p.amount, p.note]);
  for (const note of history.notes) rows.push(["Note", "", "", note, "", "", "", "", "", ""]);
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const historyHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function historyDownloadResponse(history: PersonalHistory, format: "csv" | "json") {
  const accountId = history.account.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `account-history-${accountId}-${history.generatedAt.slice(0, 10)}.${format}`;
  return new Response(format === "csv" ? personalHistoryCsv(history) : JSON.stringify(history, null, 2), {
    headers: {
      ...historyHeaders,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
    },
  });
}
