import { HardDrive } from "lucide-react";
import { removeAllSubmittedMedia } from "@/app/actions";
import { formatBytes } from "@/lib/format";
import { ConfirmAction } from "./client";

/** Admin card showing space used by media files, with a one-click cleanup for submitted jobs. */
export default function StorageCard({ usedBytes, removableBytes, removableCount }: { usedBytes: number; removableBytes: number; removableCount: number }) {
  return (
    <section className="card">
      <div className="card-header">
        <HardDrive className="size-4.5 text-brand-600" />
        <h2 className="card-title">Storage</h2>
      </div>
      <div className="card-body space-y-3">
        <div>
          <div className="num text-lg font-semibold text-slate-900">{formatBytes(usedBytes)}</div>
          <div className="text-xs text-slate-500">used by media files</div>
        </div>
        {removableCount > 0 ? (
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            <p className="text-sm text-slate-600">
              {removableCount} submitted job{removableCount === 1 ? " still has its" : "s still have their"} media ({formatBytes(removableBytes)}). Removing{" "}
              {removableCount === 1 ? "it" : "them"} keeps the transcripts and pay records.
            </p>
            <ConfirmAction
              action={removeAllSubmittedMedia}
              fields={{}}
              trigger={`Remove media of ${removableCount} submitted job${removableCount === 1 ? "" : "s"}`}
              triggerClassName="btn-secondary w-full"
              title="Remove media of all submitted jobs?"
              description={`This deletes ${removableCount} audio or video file${removableCount === 1 ? "" : "s"} (${formatBytes(removableBytes)}) for good. Jobs, transcripts and pay records are kept, but the media can't be played again and those jobs can't be sent back for corrections.`}
              confirmLabel="Remove media"
              danger
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No submitted jobs have media left to remove.</p>
        )}
      </div>
    </section>
  );
}
