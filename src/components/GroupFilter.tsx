"use client";

import { FolderOpen } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function GroupFilter({ groups, value = "" }: { groups: string[]; value?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="inline-flex max-w-full min-w-0 items-center gap-2 text-sm text-slate-600">
      <FolderOpen className="size-4 shrink-0 text-slate-400" aria-hidden />
      <span>Group</span>
      <select className="input min-w-0 py-1.5 text-sm" value={value} onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("group", e.target.value);
        else next.delete("group");
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}>
        <option value="">All groups</option>
        <option value="ungrouped">Ungrouped</option>
        {groups.map((group) => <option key={group} value={`project:${group}`}>{group}</option>)}
      </select>
    </label>
  );
}
