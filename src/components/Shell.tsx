import { db } from "@/lib/db";
import SideNav from "./SideNav";

type Props = {
  user: { id: string; name: string; email: string; role: "ADMIN" | "USER" | "REFERRER" };
  children: React.ReactNode;
};

export default async function Shell({ user, children }: Props) {
  // Transcribers who referred someone also get the referrals page.
  const refers = user.role === "USER" && (await db.user.count({ where: { referredById: user.id } })) > 0;
  // Admin menu counts: submissions to review, requests to answer and open issues.
  const badges: Record<string, number> =
    user.role === "ADMIN"
      ? {
          "/admin/reviews": await db.job.count({ where: { status: "SUBMITTED", approvedAt: null } }),
          "/admin/requests": await db.jobRequest.count({ where: { status: "PENDING", job: { status: "UNASSIGNED" } } }),
          "/admin/issues": await db.issue.count({ where: { status: "OPEN" } }),
        }
      : {};
  return (
    <div className="min-h-screen lg:pl-64">
      <SideNav user={user} refers={refers} badges={badges} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
