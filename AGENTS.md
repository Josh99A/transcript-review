# AGENTS.md

Handover notes for coding agents working on this repo. `README.md` has the user-facing setup steps;
this file is the short version plus what to watch out for.

## What the app is

Transcript Review: admins upload audio/video with a draft transcript, transcribers correct it next to a
media player, admins review (approve or send back), and the app tracks pay in UGX. Live at
https://transcribe.xinixtechnologies.com.

Roles (`Role` enum in `prisma/schema.prisma`): `ADMIN`, `USER` (transcriber), `REFERRER`.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4. Server actions live in `src/app/actions.ts`.
- Prisma 6 with Postgres (`prisma/schema.prisma`, migrations in `prisma/migrations/`).
- Auth: signed-cookie sessions (`jose`) with bcrypt passwords, in `src/lib/auth.ts`.
- Media in Cloudinary as private assets, streamed through `src/app/api/media/[id]`.
- Rich text with TipTap; Word import/export with `mammoth` and `docx`; PDF reports with `jspdf`.
- Email through Resend's HTTP API (`src/lib/email.ts`), toasts with `sonner`, icons from `lucide-react`.

## Run and check

```bash
cp .env.example .env      # set DATABASE_URL, SESSION_SECRET (32+ chars), CLOUDINARY_URL
npm install               # also runs prisma generate
npx prisma migrate deploy
npm run create-admin -- "Name" you@example.com "password"
npm run dev               # http://localhost:3000
```

There is no test suite. Before pushing, run `npm run lint` and `npm run build` (the build type-checks).
Schema changes need a new folder in `prisma/migrations/` (`npx prisma migrate dev --name <name>`).

## Layout

- `src/app/admin/` admin pages: dashboard, job upload (`jobs/new`), job review (`jobs/[id]`), requests,
  reviews, completed, issues, users and pay, guidelines. `admin/Uploads.tsx` is the upload queue.
- `src/app/(user)/` transcriber pages: Find work (`board`), My jobs and the editor (`jobs/[id]`),
  earnings, referrals, guidelines.
- `src/app/api/` route handlers: job creation, chunked uploads, media streaming, Drive lookup/import,
  Drive export OAuth, payment reports.
- `src/app/privacy/` public privacy page (linked from the Google OAuth consent screen).
- `src/lib/` domain logic: `pay.ts` and `earnings.ts` (pay), `notify.ts` and `email.ts` (notices),
  `drive.ts` (Drive import), `driveExport.ts` (Drive export), `media.ts` (Cloudinary), `newJobAlerts.ts`.
- `scripts/` startup scripts (see below) and `create-admin.ts`.

## Features to know about

- **Pay:** usual rate `RATE_PER_HOUR_UGX = 30_000` in `src/lib/pay.ts` (README still says 20,000; the code
  is right). Jobs can have their own hourly rate or a fixed price. Referrers earn `REFERRAL_RATE_PER_HOUR_UGX`.
- **Uploads with progress, pause, resume, cancel:** media goes up in 6 MB chunks (`CHUNK` in
  `admin/Uploads.tsx` must match `CHUNK` in `lib/media.ts`; Cloudinary needs at least 5 MB pieces).
- **Duplicate files blocked:** each job stores a `mediaFingerprint` (a hash of the file, or `drive:<id>`
  for Drive imports); `api/uploads` and `api/jobs` refuse a file already used by another job.
- **First-come job claiming:** a transcriber taking a job from Find work gets it straight away, no admin
  approval. `claimJob` in `actions.ts` locks the job row so two people can't both get it; others who asked
  are told it went to someone else.
- **Google Drive import:** admins can paste a Drive share link instead of uploading. The file must be
  shared as "Anyone with the link" (`src/lib/drive.ts`).
- **Google Drive export:** approved jobs are copied (recording + Word transcript) into a "Transcript
  exports" folder via OAuth (`drive.file` scope). Connected from the admin dashboard's Drive card; this is
  now connected and working in production.
- **Email notifications:** `notify()` with `email: true` also sends through Resend. Accounts with "test"
  in their name or email never get emails (`src/lib/email.ts`). New-job alerts are batched per person.
  The dashboard's Email card has a "Send me a test email" button.

## Deployment

Render, from `main`, defined in `render.yaml` (free web service + free Postgres, Frankfurt). Merging to
`main` deploys. `npm start` runs, in order: `prisma migrate deploy`, `scripts/bootstrap-admin.mjs`
(creates the first admin from `ADMIN_*` if none exists), `scripts/reset-work.mjs`, `scripts/data-fixes.mjs`,
then `next start`.

Careful: `reset-work.mjs` **deletes all jobs, pay, payments and notifications** (accounts kept) whenever
`RESET_WORK` is set to a value it hasn't seen before. `data-fixes.mjs` holds one-off data corrections that
each run once, recorded in the `Setting` table. Don't add to either without the owner asking.

## Environment variables

Names only; values are in Render's Environment for the web service. See `.env.example`.

- Required: `DATABASE_URL`, `SESSION_SECRET`, `CLOUDINARY_URL`
- First admin on a fresh deploy: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`
- Email: `RESEND_API_KEY`, `EMAIL_FROM`
- Links in emails: `APP_URL` (falls back to Render's `RENDER_EXTERNAL_URL`)
- Drive export: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Dangerous, see above: `RESET_WORK`

Never commit real values.

## Open items

- **The free Render Postgres database expires on 10 November 2026** unless it is upgraded to a paid plan.
  Upgrade it (or back up and move the data) before then, or all data is lost.
- The free web service sleeps after 15 minutes without visitors; the next visit takes about a minute.
  A paid instance avoids this.
- README's pay rate (20,000) is out of date.
