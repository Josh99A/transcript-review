import { notFound } from "next/navigation";
import MediaPlayer from "@/components/MediaPlayer";
import StatusBadge from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";
import Editor from "./Editor";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const job = await db.job.findUnique({ where: { id } });
  if (!job || job.assigneeId !== user.id) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{job.title}</h1>
        <StatusBadge status={job.status} />
        <span className="text-sm text-slate-500">
          {formatDuration(job.durationSeconds)} · pays {formatUGX(earningsFor(job.durationSeconds))}
        </span>
      </div>
      <div className="card sticky top-0 z-10">
        <MediaPlayer jobId={job.id} mediaType={job.mediaType} />
      </div>
      {job.status === "ASSIGNED" ? (
        <Editor jobId={job.id} initial={job.editedTranscript} original={job.originalTranscript} />
      ) : (
        <div className="card">
          <p className="mb-2 text-sm text-slate-500">You submitted this transcript. It&apos;s read-only unless an admin sends it back.</p>
          <pre className="whitespace-pre-wrap text-sm">{job.editedTranscript}</pre>
        </div>
      )}
    </div>
  );
}
