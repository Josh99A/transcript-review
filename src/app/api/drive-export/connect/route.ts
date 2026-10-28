import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { authUrl, driveExportConfigured, redirectUri } from "@/lib/driveExport";

// Sends an admin to Google to let the app save approved jobs into their Drive.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not allowed", { status: 403 });
  if (!driveExportConfigured()) return new Response("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.", { status: 400 });
  const state = crypto.randomUUID();
  (await cookies()).set("drive-state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/drive-export", maxAge: 600 });
  return Response.redirect(authUrl(redirectUri(req), state), 302);
}
