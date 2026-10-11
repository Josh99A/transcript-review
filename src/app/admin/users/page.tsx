import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatDate, formatUGX } from "@/lib/format";
import { NewUserForm, PayoutForm, ResetPasswordForm } from "./forms";

export default async function UsersPage() {
  await requireAdmin();
  const [users, balances, payouts] = await Promise.all([
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], include: { _count: { select: { jobs: true } } } }),
    balancesByUser(),
    db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="mb-3 text-xl font-semibold">Users and pay</h1>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Jobs</th><th>Earned</th><th>Paid</th><th>Owed</th><th>Record payment</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const b = balances.get(u.id) ?? { earned: 0, paid: 0, owed: 0 };
                return (
                  <tr key={u.id}>
                    <td><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                    <td>{u.role === "ADMIN" ? "Admin" : "User"}</td>
                    <td>{u._count.jobs}</td>
                    <td>{formatUGX(b.earned)}</td>
                    <td>{formatUGX(b.paid)}</td>
                    <td className="font-semibold">{formatUGX(b.owed)}</td>
                    <td>{u.role === "USER" && <PayoutForm userId={u.id} owed={b.owed} />}</td>
                    <td><ResetPasswordForm userId={u.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Add a user</h2>
          <NewUserForm />
        </section>
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Recent payments</h2>
          {payouts.length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Date</th><th>User</th><th>Amount</th><th>Note</th></tr></thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.createdAt)}</td><td>{p.user.name}</td><td>{formatUGX(p.amount)}</td><td>{p.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
