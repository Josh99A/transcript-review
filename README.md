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

Requires Node.js 20 or newer.

```bash
cp .env.example .env          # then set SESSION_SECRET to a long random string
npm install
npx prisma migrate deploy     # creates the SQLite database
npm run create-admin -- "Your Name" you@example.com "a-strong-password"
npm run dev                   # http://localhost:3000
```

Sign in as the admin, add transcribers under **Users & pay**, then upload a job.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind), Prisma with SQLite, signed-cookie sessions with
bcrypt-hashed passwords. Media files are stored on disk in `UPLOAD_DIR` and streamed only to
admins and the assigned user.

## Hosting notes

Uploaded media is saved to local disk, so host it on a server or VM with a persistent disk
(for example a small VPS, Railway or Render with a volume). Serverless hosts like Vercel would
need the uploads moved to object storage (S3, Vercel Blob, R2) and the database moved to Postgres.
