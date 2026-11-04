// Read-only report after migration. Does not record payments or send notifications.
import { loadEnvConfig } from "@next/env";
import { db } from "../src/lib/db";
import { balancesByUser } from "../src/lib/earnings";
import { payProblems } from "../src/lib/payCheck";

loadEnvConfig(process.cwd());

type AuditBalance = { userId: string; removedReferralEarned: number; previousBalance: number };

async function main() {
  const [users, balances, audit, problems] = await Promise.all([
    db.user.findMany({ where: { role: "USER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    balancesByUser(),
    db.setting.findUnique({ where: { key: "audit:2026-11-04-remove-referrals" } }),
    payProblems(),
  ]);
  if (!audit) throw new Error("The payment reconciliation migration has not been applied to this database.");
  const snapshot = JSON.parse(audit.value) as { createdAt: string; balances: AuditBalance[] };
  const previous = new Map(snapshot.balances.map((b) => [b.userId, b]));
  const people = users.map((u) => {
    const b = balances.get(u.id);
    return {
      ...u,
      removedReferralEarnings: previous.get(u.id)?.removedReferralEarned ?? 0,
      balanceBeforeMigration: previous.get(u.id)?.previousBalance ?? null,
      approvedEarnings: b?.earned ?? 0,
      recordedPayments: b?.paid ?? 0,
      owed: b?.owed ?? 0,
      overpaid: b?.overpaid ?? 0,
    };
  });
  console.log(JSON.stringify({
    auditedAt: snapshot.createdAt,
    generatedAt: new Date().toISOString(),
    totalOwed: people.reduce((sum, p) => sum + p.owed, 0),
    totalOverpaid: people.reduce((sum, p) => sum + p.overpaid, 0),
    people,
    payProblems: problems,
  }, null, 2));
  if (problems.length) process.exitCode = 1;
}

main().catch(() => {
  console.error("Payment reconciliation failed. Check database access, migration status, and payment integrity.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
