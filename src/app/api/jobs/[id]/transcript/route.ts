import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const job = await db.job.findUnique({ where: { id } });
  if (!job || (user.role !== "ADMIN" && job.assigneeId !== user.id)) return new Response("Not found", { status: 404 });
  const filename = job.title.replace(/[^\w\- ]+/g, "").trim() || "transcript";
  return new Response(job.editedTranscript, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.txt"`,
    },
  });
}
