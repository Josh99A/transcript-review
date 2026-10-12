import { db } from "@/lib/db";
import SideNav from "./SideNav";

type Props = {
  user: { id: string; name: string; email: string; role: "ADMIN" | "USER" | "REFERRER" };
  children: React.ReactNode;
};

export default async function Shell({ user, children }: Props) {
  // Transcribers who referred someone also get the referrals page.
  const refers = user.role === "USER" && (await db.user.count({ where: { referredById: user.id } })) > 0;
  return (
    <div className="min-h-screen lg:pl-64">
      <SideNav user={user} refers={refers} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
