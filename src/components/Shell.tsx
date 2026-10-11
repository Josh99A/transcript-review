import Link from "next/link";
import { logout } from "@/app/actions";

type Props = {
  user: { name: string; role: "ADMIN" | "USER" };
  children: React.ReactNode;
};

export default function Shell({ user, children }: Props) {
  const links =
    user.role === "ADMIN"
      ? [
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/jobs/new", label: "Upload" },
          { href: "/admin/users", label: "Users & pay" },
        ]
      : [
          { href: "/jobs", label: "My jobs" },
          { href: "/earnings", label: "My earnings" },
        ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">Transcript Review</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-slate-600 hover:text-indigo-600">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span>{user.name}</span>
            <form action={logout}>
              <button className="text-slate-600 hover:text-indigo-600">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
