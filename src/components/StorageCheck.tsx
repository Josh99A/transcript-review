"use client";

import { Copy, SearchCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { checkStorage, removeLeftoverMedia } from "@/app/actions";
import { formatBytes } from "@/lib/format";
import { ConfirmAction, Spinner } from "./client";

type Result = Awaited<ReturnType<typeof checkStorage>>;

/** Looks through storage for files no job uses and recordings stored for more than one job. */
export default function StorageCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const check = () => start(async () => setResult(await checkStorage()));

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <button type="button" className="btn-secondary w-full" onClick={check} disabled={pending}>
        {pending ? <Spinner /> : <SearchCheck className="size-4" />} {result ? "Check again" : "Check for duplicate or unused files"}
      </button>
      {result && "error" in result && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
      {result && !("error" in result) && (
        <>
          {result.leftovers === 0 && result.copies.length === 0 && <p className="text-sm text-slate-600">No duplicate or unused files. Every stored file belongs to one job.</p>}
          {result.leftovers > 0 && (
            <div className="space-y-3 rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-600">
                {result.leftovers} stored file{result.leftovers === 1 ? " isn't" : "s aren't"} used by any job ({formatBytes(result.leftoverBytes)}), for example from an upload that
                failed and was never retried.
              </p>
              <ConfirmAction
                action={async () => {
                  const res = await removeLeftoverMedia();
                  if (!res?.error) setResult(null);
                  return res;
                }}
                fields={{}}
                trigger={`Remove ${result.leftovers} unused file${result.leftovers === 1 ? "" : "s"}`}
                triggerClassName="btn-secondary w-full"
                title="Remove unused files?"
                description={`This deletes ${result.leftovers} file${result.leftovers === 1 ? "" : "s"} (${formatBytes(result.leftoverBytes)}) that no job uses. No job, transcript or recording in use is touched.`}
                confirmLabel="Remove files"
                danger
              />
            </div>
          )}
          {result.copies.length > 0 && (
            <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium"><Copy className="size-4" /> The same recording is in more than one job</p>
              <ul className="space-y-1">
                {result.copies.map((group, i) => (
                  <li key={i}>
                    {group.map((j, k) => (
                      <span key={j.id}>
                        {k > 0 && " and "}
                        <Link href={`/admin/jobs/${j.id}`} className="font-medium underline">{j.title}</Link>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="text-xs">Open them to choose which to keep, and delete the other from its job page.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
