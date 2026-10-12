import type { Metadata } from "next";
import RichText from "@/components/RichText";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { getGuidelinesInfo } from "@/lib/guidelines";

export const metadata: Metadata = { title: "Guidelines" };

export default async function GuidelinesPage() {
  await requireUser();
  const { html, updatedAt } = await getGuidelinesInfo();
  return (
    <>
      <PageHeader title="Transcription guidelines" description={`These apply to every job.${updatedAt ? ` Last updated ${formatRelative(updatedAt)}.` : ""}`} />
      <section className="card card-body text-sm leading-6 text-slate-700">
        {html ? <RichText html={html} /> : <p className="text-slate-400">No guidelines right now.</p>}
      </section>
    </>
  );
}
