"use client";

import { AudioLines, ClipboardList, HandCoins, LayoutDashboard, LogOut, Menu, Upload, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/actions";
import { Avatar } from "./ui";

const ADMIN_LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/jobs/new", label: "Upload job", icon: Upload },
  { href: "/admin/users", label: "Team & payments", icon: Users },
];
const USER_LINKS = [
  { href: "/jobs", label: "My jobs", icon: ClipboardList },
  { href: "/earnings", label: "My earnings", icon: Wallet },
];
const REFERRER_LINKS = [{ href: "/referrals", label: "My referrals", icon: HandCoins }];
const LINKS = { ADMIN: ADMIN_LINKS, USER: USER_LINKS, REFERRER: REFERRER_LINKS };
const ROLE_LABELS = { ADMIN: "Admin", USER: "Transcriber", REFERRER: "Referrer" };

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <AudioLines className="size-4.5" aria-hidden />
      </span>
      <span className="font-semibold tracking-tight text-slate-900">Transcript Review</span>
    </div>
  );
}

export default function SideNav({ user }: { user: { name: string; email: string; role: "ADMIN" | "USER" | "REFERRER" } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links: { href: string; label: string; icon: typeof Wallet; exact?: boolean }[] = LINKS[user.role];

  const isActive = (l: (typeof links)[number]) =>
    l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(l.href + "/");

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <div className="px-3 pt-2 text-[11px] font-medium tracking-wider text-slate-400 uppercase">
        {ROLE_LABELS[user.role]}
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 px-3" aria-label="Main">
        {links.map((l) => {
          const active = isActive(l);
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <l.icon className={`size-4.5 ${active ? "text-brand-600" : "text-slate-400"}`} aria-hidden />
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
          </div>
          <form action={logout}>
            <button className="btn-ghost size-8 px-0" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{nav}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <button className="btn-ghost size-9 px-0" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <Brand />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
            <button className="btn-ghost absolute top-3.5 right-3 size-9 px-0" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
