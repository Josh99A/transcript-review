# Transcript Review

Admins upload audio or video with a transcript and assign it to a transcriber. The transcriber
corrects the transcript next to a media player and submits it. Pay is **UGX 30,000 per hour of
media**, prorated by length. Submitted work becomes earned and payable once an admin approves it.

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

## Organising files into groups

Set **Group / project** when uploading or editing a job. Type a new group name or choose one already
used; existing projects are groups too. On the dashboard or Completed page, filter by **Group** and
expand **Organise jobs into groups** to move several jobs together. Leaving the destination empty
ungroups the selected jobs.

Approved jobs export as `Transcript exports / Group / Job`, with the recording and final Word
transcript together in the job folder. Ungrouped jobs stay directly under `Transcript exports`.
Changing an approved job's group moves its existing Drive folder and reuses its recording. Use
**Organise existing exports by group** on the dashboard's Google Drive card to arrange earlier exports
into this structure too. Drive must be connected; failed moves can be retried from the job or dashboard.

The Drive folder organisation checks run locally without Google credentials:

```bash
npx tsx --test src/lib/driveFolders.test.ts
```

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

- **Transcribers:** a job assigned (with the job's language, length, pay and deadline), changes needed with the admin's
  notes (and edits to them), approval with the pay, payments received with the amount and where it
  was sent, a job taken off them, transferred or cancelled, new instructions or guidelines, a replaced
  transcript, and admin replies to their issues.
- **Admins:** jobs assigned or reassigned by an admin (who received it and which admin assigned it),
  including assignments during upload and transfers of completed jobs; a transcriber taking a job from
  Find work (who took it, their email, languages and jobs
  in progress, and the job's details), submissions and resubmissions ready to review, a transcriber leaving a
  job, issues raised and replies, and a job that couldn't be copied to Google Drive.
- **New accounts:** a welcome email with a sign-in link (the password is never emailed).
- **New jobs:** every transcriber hears about jobs that go up on Find work, whatever languages they
  listed. Jobs posted within a few minutes of each other, like a batch of
  uploads, come as one email per person.

Assignment notification checks run without contacting an email provider:

```bash
node --conditions=react-server --import tsx --test src/lib/assignmentNotices.test.ts
```

To turn it on:

1. In Resend, add and verify your domain (Domains), then create an API key (API Keys) with sending access.
2. On Render, add `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Transcript Review <notifications@your-domain.com>`)
   to the web service's Environment, and let it redeploy.

The admin dashboard's **Email notifications** card shows the sender and has a **Send me a test email**
button that reports any error from Resend. Without `RESEND_API_KEY` nothing is emailed. Accounts with "test" in their name or
email only get in-app notices, never emails. Until a domain is verified, leave `EMAIL_FROM` empty to send
from `onboarding@resend.dev`; Resend then only delivers to the email address of your own Resend account.

### Payment reconciliation

All non-admin accounts are transcribers. Earnings come only from their own approved work.
Migration `20261104150000_remove_referrals` converts former referrer accounts, removes referral
attribution, and saves an audit snapshot under `Setting` key `audit:2026-11-04-remove-referrals`.
It preserves accounts, payment details, transcription credits (including locked rates), and all
recorded payments. Previously paid amounts above approved transcription earnings are shown as
overpayments and offset future earnings. One person's overpayment never reduces another's balance.
No money is transferred or refunded by the migration.

Deploy the application and migration together; the previous application expects the removed database
fields. After deployment, run `npm run reconcile-payments` against the deployed database for a
read-only report of removed earnings, recorded payments, current amounts owed, overpayments, and
any job-credit inconsistencies. The migration runs automatically on application startup.

To test the migration and accounting on a test Postgres database, run
`TEST_DATABASE_URL=postgresql://... npm run test:payments`. The test creates and drops its own isolated
schema and covers account conversion, historical/custom rates, pending work, retained payments,
removed earnings, and overpayments offsetting future work.

### Downloadable account history

Transcribers can download CSV or JSON from **My earnings → Download your history**. Exports include
all retained job credits and payments, current balances, and the person's preserved reconciliation
totals before and after referral removal. JSON also includes their account and payment details.
Exports exclude passwords, media credentials, transcript contents, and other people's records.

Admins can use **Team & payments → View history** to follow a person's dated job-credit/payment
ledger, inspect reconciliation totals, and download the same exports for that account. Job credits
link to the underlying job; payments retain their IDs, dates, amounts, and notes. This is retained
record history, not a log of past edits: deleted records and unrecorded actors cannot be reconstructed.

The personal endpoint derives identity from the session. The separate admin endpoint requires an
admin session. Both return private, non-cached attachments. CSV text is escaped for spreadsheet
formulas. To include HTTP authorization/download and server-rendering checks in the Postgres test,
run `npm run build` first, then `TEST_DATABASE_URL=postgresql://... TEST_HISTORY_HTTP=1 npm run test:payments`.
