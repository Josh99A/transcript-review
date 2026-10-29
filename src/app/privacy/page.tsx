import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy" };

// Public page, linked from the Google OAuth consent screen. Google requires one before the app can be published.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-6 text-slate-700">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Privacy policy</h1>
      <p className="mt-2 text-slate-500">Transcript Review</p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">What we store</h2>
      <p className="mt-2">
        Your name, email address and a hashed password, the jobs you work on, your edits and comments, and the pay
        records for your work. Audio recordings and other uploaded files are stored with our media host, Cloudinary.
      </p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Email</h2>
      <p className="mt-2">We send notifications about jobs and payments to your email address through Resend.</p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Google Drive</h2>
      <p className="mt-2">
        An admin can connect a Google account so approved jobs are copied into a folder in that account&apos;s Google
        Drive. The app uses the &quot;drive.file&quot; permission, so it can only see and change files it created
        itself, never anything else in the Drive. We store a token for that account to keep the connection working.
        Data from Google is used only to make these copies, is not shared with anyone else and is not used for
        advertising. The admin can disconnect at any time, or remove access at myaccount.google.com/permissions.
      </p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Sharing</h2>
      <p className="mt-2">We don&apos;t sell your data or share it with anyone except the services named above.</p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Contact and deletion</h2>
      <p className="mt-2">
        To see or delete your data, contact the admin who invited you, or email awulejoshua823@gmail.com.
      </p>

      <p className="mt-10">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
