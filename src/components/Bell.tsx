"use client";

import { Bell as BellIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Bell with the unread count. Checks on every page change, when the tab comes back, and once a minute. */
export default function Bell({ onClick }: { onClick?: () => void }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/api/notifications", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((d: { unread: number }) => alive && setUnread(d.unread))
        .catch(() => {});
    check();
    const timer = setInterval(check, 60_000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link href="/notifications" onClick={onClick} className="btn-ghost relative size-9 px-0" aria-label={label} title={label}>
      <BellIcon className="size-5" />
      {unread > 0 && (
        <span className="num absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
