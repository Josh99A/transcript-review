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

## Hosting on Railway

The repo includes `railway.json`. Database migrations run when the app starts (not during the
build), and the first admin is created automatically from environment variables.

1. Create a service from this GitHub repo.
2. Add a **volume** to the service mounted at `/data`.
3. Set these variables on the service:
   - `DATABASE_URL` = `file:/data/app.db`
   - `UPLOAD_DIR` = `/data/uploads`
   - `SESSION_SECRET` = a long random string (e.g. `${{secret(64)}}` in Railway)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ chars) and optionally `ADMIN_NAME` for the first admin
4. Generate a public domain under the service's Networking settings.

Free and Trial plans cap volumes at 0.5 GB, which fits only a few hours of compressed audio.
Upgrade to Hobby for more space, or move uploads to object storage.

## Other hosts

Uploaded media is saved to local disk, so the app needs a persistent disk (a VPS, Railway or
Render with a volume). Serverless hosts like Vercel would need the uploads moved to object
storage (S3, R2) and the database moved to Postgres.
