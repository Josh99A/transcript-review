import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectNames } from "@/lib/projects";
import UploadForm from "./UploadForm";

export const metadata: Metadata = { title: "Upload job" };

export default async function NewJobPage() {
  await requireAdmin();
  const [users, projects] = await Promise.all([
    db.user.findMany({ where: { role: "USER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    projectNames(),
  ]);
  return (
    <>
      <PageHeader
        back={<Link href="/admin" className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Dashboard</Link>}
        title="Upload a job"
        description="Add the media and its transcript, then choose who will correct it."
      />
      <UploadForm users={users} projects={projects} />
    </>
  );
}
