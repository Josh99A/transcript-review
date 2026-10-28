import { Mail } from "lucide-react";
import { sendTestEmail } from "@/app/actions";
import { ActionForm } from "./client";

/** Admin card showing whether email notifications are on, with a test send. */
export default function EmailCard({ configured, sender }: { configured: boolean; sender: string }) {
  return (
    <section className="card" id="email">
      <div className="card-header">
        <Mail className="size-4.5 text-brand-600" />
        <h2 className="card-title">Email notifications</h2>
      </div>
      <div className="card-body space-y-3">
        {configured ? (
          <>
            <p className="text-sm text-slate-600">
              Important notices are also emailed, from <span className="font-medium text-slate-900">{sender}</span>.
            </p>
            <ActionForm action={sendTestEmail}>
              <button className="btn-secondary w-full">Send me a test email</button>
            </ActionForm>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Notices only show in the app. To email them too, add RESEND_API_KEY and EMAIL_FROM to the app&apos;s settings on Render.
          </p>
        )}
      </div>
    </section>
  );
}
