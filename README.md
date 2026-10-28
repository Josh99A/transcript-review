# Transcript Review

Admins upload audio or video with a transcript and assign it to a transcriber. The transcriber
corrects the transcript next to a media player and submits it. Pay is **UGX 20,000 per hour of
media**, prorated by length, and is credited the moment a transcript is submitted.

- **Admin:** dashboard of every job (who it's assigned to, status, when it was submitted, pay),
  what each user has earned, been paid and is owed; upload jobs; add users; record payments;
  send a submission back for more corrections.
- **Transcriber:** list of assigned jobs, an editor with autosave, and an earnings page showing
  earned, paid and still-to-be-paid.

Resubmitting after a job is sent back never pays twice. The pay rate lives in `src/lib/pay.ts`.

## Run it locally

Requires Node.js 20 or newer, a Postgres database and a Cloudinary account (free plan is fine).

```bash
cp .env.example .env          # then set DATABASE_URL, SESSION_SECRET and CLOUDINARY_URL
npm install
npx prisma migrate deploy     # creates the tables
npm run create-admin -- "Your Name" you@example.com "a-strong-password"
npm run dev                   # http://localhost:3000
```

Sign in as the admin, add transcribers under **Users & pay**, then upload a job.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind), Prisma with Postgres, signed-cookie sessions with
bcrypt-hashed passwords. Media files are stored in Cloudinary as authenticated (private) assets and
streamed through the app only to admins and the assigned user. Cloudinary's free plan caps a single
video or audio file at 100 MB.

## Hosting on Render

The repo includes `render.yaml`. On render.com choose **New > Blueprint**, pick this repo, and fill in
`CLOUDINARY_URL` (Cloudinary dashboard > API Keys > API environment variable) plus `ADMIN_EMAIL`,
`ADMIN_PASSWORD` (8+ chars) and optionally `ADMIN_NAME` for the first admin. It creates a free web
service and a free Postgres database. Migrations run when the app starts, and the first admin is
created automatically. Render is the only host the app is set up for, and it deploys from `main`.

Render deletes a free Postgres database 30 days after it is created unless it is upgraded, and a
free web service sleeps after 15 minutes without visitors, so the next visit takes about a minute.

## Copying approved jobs to Google Drive

When an admin approves a job, the app can copy its recording and final transcript (as Word) into a
folder called "Transcript exports" in a Google Drive, one folder per job. Approving it again after
changes replaces the transcript there. To set it up:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the
   **Google Drive API** (APIs & Services > Library).
2. APIs & Services > OAuth consent screen: choose **External**, fill in the app name and your email,
   add the scope `.../auth/drive.file`, then **Publish app** so it is "In production". (In "Testing",
   Google ends the connection after 7 days.)
3. APIs & Services > Credentials > Create credentials > OAuth client ID > **Web application**. Under
   Authorised redirect URIs add `https://<your app>.onrender.com/api/drive-export/callback`.
4. On Render, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from that client to the web service's
   Environment, and let it redeploy.
5. In the app, open the admin dashboard and click **Connect Google Drive** on the Google Drive card,
   signing in with the Google account whose Drive should receive the files.

The folder can be renamed or moved anywhere in that Drive. The app only has access to files it made.

## Email notifications

Besides the bell in the app, the important notices are also emailed through [Resend](https://resend.com):

- **Transcribers:** a job assigned or a request approved (with the job's language, length, pay and
  deadline), a request declined or the job going to someone else, changes needed with the admin's
  notes (and edits to them), approval with the pay, payments received with the amount and where it
  was sent, a job taken off them, transferred or cancelled, new instructions or guidelines, a replaced
  transcript, and admin replies to their issues.
- **Admins:** job requests (who asked, their email, languages and jobs in progress, the job's details
  and how many others asked), submissions and resubmissions ready to review, a transcriber leaving a
  job, issues raised and replies, and a job that couldn't be copied to Google Drive.
- **Referrers:** referral pay earned when someone they referred has a transcript approved.
- **New accounts:** a welcome email with a sign-in link (the password is never emailed).

To turn it on:

1. In Resend, add and verify your domain (Domains), then create an API key (API Keys) with sending access.
2. On Render, add `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Transcript Review <notifications@your-domain.com>`)
   to the web service's Environment, and let it redeploy.

Without `RESEND_API_KEY` nothing is emailed. Until a domain is verified, leave `EMAIL_FROM` empty to send
from `onboarding@resend.dev`; Resend then only delivers to the email address of your own Resend account.
