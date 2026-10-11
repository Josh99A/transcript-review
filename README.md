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
created automatically.

Render deletes a free Postgres database 30 days after it is created unless it is upgraded, and a
free web service sleeps after 15 minutes without visitors, so the next visit takes about a minute.
