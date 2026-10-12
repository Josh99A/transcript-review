import { CircleCheck, CircleDot, RotateCcw, Send } from "lucide-react";
import { replyToIssue, setIssueStatus } from "@/app/actions";
import { ActionForm } from "@/components/client";
import { Avatar } from "@/components/ui";
import { formatRelative } from "@/lib/format";

export type IssueWithMessages = {
  id: string;
  subject: string;
  status: "OPEN" | "RESOLVED";
  resolvedAt: Date | null;
  messages: {
    id: string;
    body: string;
    createdAt: Date;
    author: { name: string; role: string };
  }[];
};

export function IssueStatus({ status }: { status: "OPEN" | "RESOLVED" }) {
  return status === "OPEN" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">
      <CircleDot className="size-3" /> Open
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
      <CircleCheck className="size-3" /> Resolved
    </span>
  );
}

/** An issue's conversation, with a reply box. Admins can also resolve or reopen it. */
export default function IssueThread({ issue, admin, canReply = true }: { issue: IssueWithMessages; admin: boolean; canReply?: boolean }) {
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {issue.messages.map((m) => {
          const fromAdmin = m.author.role === "ADMIN";
          return (
            <li key={m.id} className="flex gap-3">
              <Avatar name={m.author.name} size="sm" />
              <div className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm ${fromAdmin ? "bg-brand-50/70 ring-1 ring-brand-600/10" : "bg-slate-50 ring-1 ring-slate-200"}`}>
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-900">{m.author.name}</span>
                  {fromAdmin && <span className="text-brand-700">Admin</span>}
                  <span>{formatRelative(m.createdAt)}</span>
                </p>
                <p className="mt-1 break-words whitespace-pre-line text-slate-800">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {issue.status === "RESOLVED" && issue.resolvedAt && (
        <p className="text-xs text-emerald-700">
          Resolved {formatRelative(issue.resolvedAt)}.{admin ? "" : " Reply if it's still a problem and it reopens."}
        </p>
      )}
      {canReply && (
        <ActionForm action={replyToIssue} resetOnSuccess>
          <input type="hidden" name="issueId" value={issue.id} />
          <div className="space-y-2">
            <label className="sr-only" htmlFor={`reply-${issue.id}`}>
              Reply
            </label>
            <textarea className="input h-20" id={`reply-${issue.id}`} name="body" required maxLength={3000} placeholder={admin ? "Reply to the transcriber" : "Add more detail or reply to the admin"} />
            <div className="flex flex-wrap items-center gap-3">
              {admin && issue.status === "OPEN" && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="resolve" className="size-4 rounded border-slate-300" /> Mark resolved
                </label>
              )}
              <button className="btn ml-auto">
                <Send className="size-4" /> Send reply
              </button>
            </div>
          </div>
        </ActionForm>
      )}
      {admin && (
        <ActionForm action={setIssueStatus} className="border-t border-slate-100 pt-3">
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="status" value={issue.status === "OPEN" ? "RESOLVED" : "OPEN"} />
          {issue.status === "OPEN" ? (
            <button className="btn-secondary w-full sm:w-auto">
              <CircleCheck className="size-4" /> Mark resolved without replying
            </button>
          ) : (
            <button className="btn-secondary w-full sm:w-auto">
              <RotateCcw className="size-4" /> Reopen
            </button>
          )}
        </ActionForm>
      )}
    </div>
  );
}

export const issueInclude = {
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { name: true, role: true } } },
  },
};
