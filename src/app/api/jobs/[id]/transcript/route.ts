import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { textToDocx } from "@/lib/docx";

// Downloads the latest transcript as .txt, or as a Word file with ?format=docx.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const job = await db.job.findUnique({ where: { id } });
  if (!job || (user.role !== "ADMIN" && job.assigneeId !== user.id)) return new Response("Not found", { status: 404 });
  const filename = job.title.replace(/[^\w\- ]+/g, "").trim() || "transcript";
  if (new URL(req.url).searchParams.get("format") === "docx") {
    const file = await textToDocx(job.title, job.editedTranscript);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
      },
    });
  }
  return new Response(job.editedTranscript, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.txt"`,
    },
  });
}
