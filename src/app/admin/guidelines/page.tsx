import type { Metadata } from "next";
import { updateGuidelines } from "@/app/actions";
import { ActionForm } from "@/components/client";
import RichTextEditor from "@/components/RichTextEditor";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { getGuidelinesInfo } from "@/lib/guidelines";

export const metadata: Metadata = { title: "Guidelines" };

export default async function GuidelinesPage() {
  await requireAdmin();
  const { html, updatedAt } = await getGuidelinesInfo();
  return (
    <>
      <PageHeader
        title="Transcription guidelines"
        description="The rules shown on every job, for every transcriber. Edit them whenever you need to add more. Notes for one job are edited on that job's page under Edit details and notes."
      />
      <section className="card">
        <ActionForm action={updateGuidelines} className="card-body space-y-4">
          <RichTextEditor name="guidelines" id="guidelines" defaultValue={html} minHeight="16rem" />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="tell" defaultChecked className="mt-0.5 size-4 rounded border-slate-300" />
            <span>Tell transcribers who have jobs open that the guidelines changed</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn">Save guidelines</button>
            <span className="text-xs text-slate-500">{updatedAt ? `Last changed ${formatRelative(updatedAt)}` : "These are the starting guidelines; nobody has changed them yet."}</span>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
