import { getCurrentUser } from "@/lib/auth";
import { paymentReport, reportCsv, reportFileName, reportPdf } from "@/lib/payReport";

// Who is owed what, with payment numbers, as a PDF or CSV an admin can keep and pay from offline.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed", { status: 403 });
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  const report = await paymentReport();
  const name = `${reportFileName(report)}.${csv ? "csv" : "pdf"}`;
  const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" };
  if (csv) return new Response(reportCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  return new Response(await reportPdf(report), { headers: { ...headers, "Content-Type": "application/pdf" } });
}
