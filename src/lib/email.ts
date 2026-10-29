import "server-only";
import { after } from "next/server";

// Emails go out through Resend (resend.com). Set RESEND_API_KEY to turn them on, and EMAIL_FROM to an address on a
// domain verified in Resend. Without a key nothing is sent and the app works as before, with in-app notices only.

const DEFAULT_FROM = "Transcript Review <onboarding@resend.dev>";

export type Detail = [label: string, value: string | number | null | undefined];
export type Email = { to: string; name?: string | null; subject: string; body?: string | null; details?: Detail[]; href?: string; button?: string };

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY?.trim();
}

/** The address emails link back to. Render sets RENDER_EXTERNAL_URL itself; APP_URL wins when both are set. */
export function appUrl() {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render({ name, subject, body, details, href, button }: Email) {
  const link = href && appUrl() ? appUrl() + href : null;
  const rows = (details ?? []).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
${name ? `<p style="margin:0 0 12px;font-size:15px">Hi ${escape(name.split(" ")[0])},</p>` : ""}
<h1 style="margin:0 0 12px;font-size:18px;line-height:1.35">${escape(subject)}</h1>
${body ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;white-space:pre-line">${escape(body)}</p>` : ""}
${rows.length ? `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">${rows.map(([k, v]) => `<tr><td style="width:1%;padding:6px 16px 6px 0;color:#71717a;vertical-align:top;white-space:nowrap">${escape(k)}</td><td style="padding:6px 0;white-space:pre-line">${escape(String(v))}</td></tr>`).join("")}</table>` : ""}
${link ? `<a href="${escape(link)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">${escape(button ?? "Open in Transcript Review")}</a>` : ""}
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#71717a;text-align:center">You're getting this because you have an account on Transcript Review. You'll also find this in the app's notifications.</p>
</body></html>`;
  const text = [name ? `Hi ${name.split(" ")[0]},` : null, subject, body, rows.map(([k, v]) => `${k}: ${v}`).join("\n"), link].filter(Boolean).join("\n\n");
  return { html, text };
}

/** The address emails come from. */
export function emailSender() {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

/** Sends the emails now. Never throws: a lost email mustn't fail the action that caused it. Returns what went wrong, if anything. */
/** Test accounts (with "test" in their name or email) only get in-app notices, never emails. */
export function isTestAccount(e: { to: string; name?: string | null }) {
  return /test/i.test(e.to) || /test/i.test(e.name ?? "");
}

export async function sendEmails(all: Email[]): Promise<string | null> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "RESEND_API_KEY isn't set.";
  const emails = all.filter((e) => !isTestAccount(e));
  if (!emails.length) return null;
  const from = emailSender();
  let error: string | null = null;
  // The batch endpoint takes up to 100 emails a call; each recipient gets their own email.
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100).map((e) => ({ from, to: [e.to], subject: e.subject, ...render(e) }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).slice(0, 500);
        console.error(`Email send failed (${res.status}):`, text);
        let message = text;
        try {
          message = (JSON.parse(text) as { message?: string }).message ?? text;
        } catch {}
        error = `Resend refused it (${res.status}): ${message}`;
      }
    } catch (e) {
      console.error("Email send failed", e);
      error = "Couldn't reach Resend.";
    }
  }
  return error;
}

/** Sends the emails once the response is on its way, so actions stay quick. Outside a request it just sends them. */
export function sendEmailsLater(emails: Email[]) {
  if (!emailConfigured() || !emails.length) return;
  try {
    after(() => sendEmails(emails));
  } catch {
    void sendEmails(emails);
  }
}
