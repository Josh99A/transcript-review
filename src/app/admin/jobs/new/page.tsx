import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import UploadForm from "./UploadForm";

export default async function NewJobPage() {
  await requireAdmin();
  const users = await db.user.findMany({ where: { role: "USER" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="card max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">Upload media and transcript</h1>
      <UploadForm users={users} />
    </div>
  );
}
