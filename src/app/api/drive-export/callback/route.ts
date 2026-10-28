import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { connectDrive, redirectUri } from "@/lib/driveExport";

// Google sends the admin back here after they allow (or refuse) Drive access.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("drive-state")?.value;
  jar.delete({ name: "drive-state", path: "/api/drive-export" });
  const back = (error?: string) => {
    const dest = new URL("/admin", redirectUri(req));
    dest.searchParams.set("drive", error ? "error" : "connected");
    if (error) dest.searchParams.set("drive_error", error.slice(0, 300));
    dest.hash = "drive";
    return Response.redirect(dest, 302);
  };
  if (url.searchParams.get("error")) return back(url.searchParams.get("error") === "access_denied" ? "You didn't allow access to Google Drive." : url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("The sign-in link expired. Try connecting again.");
  try {
    await connectDrive(code, redirectUri(req));
  } catch (e) {
    return back(e instanceof Error ? e.message : "Couldn't connect Google Drive.");
  }
  return back();
}
