import { getCurrentUser } from "@/lib/auth";
import { historyDownloadResponse, historyHeaders, personalHistoryFor } from "@/lib/personalHistory";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download your history.", { status: 401, headers: historyHeaders });
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  if (format !== "csv" && format !== "json") return new Response("Choose CSV or JSON.", { status: 400, headers: historyHeaders });
  // Identity comes exclusively from the signed session, never a supplied user ID.
  return historyDownloadResponse(await personalHistoryFor(user.id), format);
}
