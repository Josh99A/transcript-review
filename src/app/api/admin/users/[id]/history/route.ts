import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { historyDownloadResponse, historyHeaders, personalHistoryFor } from "@/lib/personalHistory";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download history.", { status: 401, headers: historyHeaders });
  if (user.role !== "ADMIN") return new Response("Not allowed", { status: 403, headers: historyHeaders });
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  if (format !== "csv" && format !== "json") return new Response("Choose CSV or JSON.", { status: 400, headers: historyHeaders });
  const { id } = await params;
  if (!await db.user.findUnique({ where: { id }, select: { id: true } })) return new Response("Person not found", { status: 404, headers: historyHeaders });
  return historyDownloadResponse(await personalHistoryFor(id), format);
}
