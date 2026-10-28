import { Smartphone } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db";
import SideNav from "./SideNav";

type Props = {
  user: { id: string; name: string; email: string; role: "ADMIN" | "USER" | "REFERRER" };
  children: React.ReactNode;
};

export default async function Shell({ user, children }: Props) {
  // Transcribers who referred someone also get the referrals page.
  const refers = user.role === "USER" && (await db.user.count({ where: { referredById: user.id } })) > 0;
  // Admin menu counts: submissions to review and open issues.
  const badges: Record<string, number> =
    user.role === "ADMIN"
      ? {
          "/admin/reviews": await db.job.count({ where: { status: "SUBMITTED", approvedAt: null } }),
          "/admin/issues": await db.issue.count({ where: { status: "OPEN" } }),
        }
      : {};
  // Nobody can be paid without a number, so people without one are reminded on every page until they add it.
  const noPayPhone = user.role !== "ADMIN" && !(await db.user.findUnique({ where: { id: user.id }, select: { payPhone: true } }))?.payPhone;
  const payHref = user.role === "REFERRER" ? "/referrals#pay" : "/earnings#pay";
  return (
    <div className="min-h-screen lg:pl-64">
      <SideNav user={user} refers={refers} badges={badges} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {noPayPhone && (
          <div role="alert" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Smartphone className="size-5 shrink-0 text-amber-600" />
            <p className="min-w-0 flex-1"><span className="font-semibold">Add your payment phone number.</span> You can&apos;t receive payments until you do.</p>
            <Link href={payHref} className="btn btn-sm shrink-0">Add number</Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
