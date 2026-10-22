"use client";

import { ArrowDownUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Sort menu for a job list; remembers the choice for this page so it sticks on the next visit. */
export default function SortSelect({ page, value, options, className = "" }: { page: string; value: string; options: { value: string; label: string }[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className={`inline-flex min-w-0 items-center gap-2 text-sm text-slate-600 ${className}`}>
      <ArrowDownUp className="size-4 shrink-0 text-slate-400" aria-hidden />
      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Sort by</span>
      <select
        className="input min-w-0 py-1.5 text-sm"
        value={value}
        onChange={(e) => {
          document.cookie = `sort-${page}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          const next = new URLSearchParams(params);
          next.set("sort", e.target.value);
          router.replace(`${pathname}?${next}`, { scroll: false });
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
