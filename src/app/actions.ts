"use server";

import { payProblems } from "@/lib/payCheck";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { cleanRich, richText } from "@/lib/richtext";
import { cleanDoc } from "@/lib/richDoc";
import { docText } from "@/lib/docText";
import { getGuidelinesInfo, setGuidelines } from "@/lib/guidelines";
import { createSession, destroySession, homeFor, requireAdmin, requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatDuration, formatPayDate, formatUGX, parseDeadline } from "@/lib/format";
import { notify, notifyAdmins, settleNotices } from "@/lib/notify";
import { type Detail, sendEmailsLater } from "@/lib/email";
import { creditAmount, earningsFor, hasOwnPay, parsePricing, RATE_PER_HOUR_UGX, referralPayFor } from "@/lib/pay";
import { normalizePhone, PAY_NETWORKS } from "@/lib/payment";
import { cleanLanguages } from "@/lib/jobFields";
import { getLanguages, getNextPayDate, languageOptions, setLanguages, setNextPayDate } from "@/lib/settings";
import { deleteMedia, listStoredMedia, publicIdOf } from "@/lib/media";
import { disconnectDrive, exportLater, waitingForDrive } from "@/lib/driveExport";

export type FormState = { error?: string; ok?: string; email?: string } | undefined;

// ---------- Auth ----------

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Wrong email or password.", email };
  }
  await createSession(user.id);
  redirect(homeFor(user.role));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ---------- Admin: users ----------

const newUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "USER", "REFERRER"]),
  referredById: z.string().optional(),
});

export async function createUser(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = newUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password, role } = parsed.data;
  const referredById = role === "USER" && parsed.data.referredById ? parsed.data.referredById : null;
  if (await db.user.findUnique({ where: { email } })) return { error: "That email is already in use." };
  const refError = referredById ? await referrerError(null, referredById) : null;
  if (refError) return { error: refError };
  await db.user.create({ data: { name, email, role, referredById, passwordHash: await bcrypt.hash(password, 10) } });
  // The password isn't emailed; the admin passes it on themselves.
  sendEmailsLater([
    {
      to: email,
      name,
      subject: "Your Transcript Review account is ready",
      body: "An admin made you an account. Sign in with this email address and the password the admin gave you.",
      details: [["Email", email]],
      href: "/login",
      button: "Sign in",
    },
  ]);
  revalidatePath("/admin/users");
  return { ok: `Created ${name}.` };
}

export async function resetPassword(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return { ok: "Password updated." };
}

/**
 * Sets who referred a transcriber. Work they've already submitted with no referrer is credited to
 * the new one; work already credited to a referrer stays with them.
 */
/** Referrers are referrer accounts or other transcribers; nobody refers themselves, directly or round a loop. */
async function referrerError(userId: string | null, referredById: string): Promise<string | null> {
  if (referredById === userId) return "Someone can't refer themselves.";
  const ref = await db.user.findUnique({ where: { id: referredById }, select: { role: true } });
  if (!ref || (ref.role !== "REFERRER" && ref.role !== "USER")) return "Pick a referrer from the list.";
  if (userId) {
    // Walk up from the new referrer; reaching this transcriber would make a loop.
    let up: string | null = referredById;
    for (let i = 0; up && i < 50; i++) {
      const next: { referredById: string | null } | null = await db.user.findUnique({ where: { id: up }, select: { referredById: true } });
      up = next?.referredById ?? null;
      if (up === userId) return "That would make them refer each other.";
    }
  }
  return null;
}

export async function setReferrer(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const referredById = String(formData.get("referredById") ?? "") || null;
  const t = await db.user.findUnique({ where: { id: userId } });
  if (!t || t.role !== "USER") return { error: "Only transcribers can have a referrer." };
  const refError = referredById ? await referrerError(userId, referredById) : null;
  if (refError) return { error: refError };
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { referredById } }),
    ...(referredById ? [db.earning.updateMany({ where: { userId, referrerId: null }, data: { referrerId: referredById } })] : []),
  ]);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: referredById ? "Referrer saved." : "Referrer removed." };
}

/** Saves where someone wants to be paid. People set their own; admins can set anyone's. */
export async function savePaymentDetails(formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const userId = me.role === "ADMIN" && formData.get("userId") ? String(formData.get("userId")) : me.id;
  const network = String(formData.get("payNetwork") ?? "");
  const rawPhone = String(formData.get("payPhone") ?? "").trim();
  const name = String(formData.get("payName") ?? "").trim().slice(0, 100);
  if (!rawPhone) {
    await db.user.update({ where: { id: userId }, data: { payNetwork: null, payPhone: null, payName: null } });
  } else {
    const phone = normalizePhone(rawPhone);
    if (!phone) return { error: "Enter a valid phone number, e.g. 0772 123 456." };
    if (!(PAY_NETWORKS as readonly string[]).includes(network)) return { error: "Pick how you'd like to be paid." };
    await db.user.update({ where: { id: userId }, data: { payNetwork: network, payPhone: phone, payName: name || null } });
  }
  revalidatePath("/", "layout");
  return { ok: rawPhone ? "Payment details saved." : "Payment details removed." };
}

/** The languages a transcriber can work in. */
export async function saveLanguages(formData: FormData): Promise<FormState> {
  const me = await requireRole("USER");
  const languages = cleanLanguages([...formData.getAll("languages").map(String), String(formData.get("other") ?? "")], await languageOptions());
  await db.user.update({ where: { id: me.id }, data: { languages } });
  revalidatePath("/", "layout");
  return { ok: languages.length ? "Languages saved." : "Languages cleared." };
}

/** Admins add a language to the list offered on jobs and to transcribers. */
export async function addLanguage(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const list = await getLanguages();
  const [name] = cleanLanguages([String(formData.get("language") ?? "")], list);
  if (!name) return { error: "Type the language to add." };
  if (list.includes(name)) return { error: `${name} is already on the list.` };
  await setLanguages([...list, name]);
  revalidatePath("/", "layout");
  return { ok: `${name} added.` };
}

/** Takes a language off the list. People who listed it keep it, and jobs in it keep their language. */
export async function removeLanguage(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const name = String(formData.get("language") ?? "");
  await setLanguages((await getLanguages()).filter((l) => l !== name));
  revalidatePath("/", "layout");
  return { ok: `${name} removed from the list.` };
}

// ---------- Admin: pay dates ----------

export async function updatePayDate(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const date = String(formData.get("payDate") ?? "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Enter a valid date." };
  await setNextPayDate(date || null);
  revalidatePath("/", "layout");
  return { ok: date ? `Next pay date set to ${formatPayDate(date)}.` : "Pay date cleared." };
}

/** Records a payment for everyone who is owed, in one go, on pay day. */
export async function payEveryone(): Promise<FormState> {
  await requireAdmin();
  const payDate = await getNextPayDate();
  const note = payDate ? `Pay run ${formatPayDate(payDate)}` : "Pay run";
  // One pay run at a time, so a double click or two admins can't pay the same balance twice.
  const payouts = await db.$transaction(async (tx) => {
    await lockPayments(tx);
    const [balances, people, problems] = await Promise.all([
      balancesByUser(tx),
      tx.user.findMany({ where: { role: { in: ["USER", "REFERRER"] } }, select: { id: true } }),
      payProblems(tx),
    ]);
    // People with pay that doesn't match their jobs are left out until it's fixed.
    const held = new Set(problems.map((p) => p.userId));
    const rows = people.map((p) => ({ userId: p.id, amount: balances.get(p.id)?.owed ?? 0, note })).filter((p) => p.amount > 0 && !held.has(p.userId));
    if (rows.length) await tx.payout.createMany({ data: rows });
    return { rows, held: people.filter((p) => held.has(p.id) && (balances.get(p.id)?.owed ?? 0) > 0).length };
  });
  const { rows: payoutRows, held } = payouts;
  const skipped = held ? ` ${held} ${held === 1 ? "person was" : "people were"} left out because of a pay problem; see the warning on Team & payments.` : "";
  if (payoutRows.length === 0) return { error: held ? `Nobody was paid.${skipped}` : "Nobody is owed anything right now." };
  const paidTo = await payDestinations(payoutRows.map((p) => p.userId));
  await Promise.all(
    payoutRows.map((p) =>
      notify([p.userId], {
        title: `You were paid UGX ${p.amount.toLocaleString("en-US")}`,
        body: note,
        href: "/earnings",
        email: true,
        details: [["Amount", formatUGX(p.amount)], ["Sent to", paidTo.get(p.userId)], ["Date", formatPayDate(new Date().toISOString().slice(0, 10))]],
      }),
    ),
  );
  revalidatePath("/", "layout");
  const total = payoutRows.reduce((s, p) => s + p.amount, 0);
  return { ok: `Recorded ${payoutRows.length} payment${payoutRows.length === 1 ? "" : "s"} totalling UGX ${total.toLocaleString("en-US")}.${skipped}` };
}

/** Serializes everything that reads balances and records payments. */
async function lockPayments(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
}

/** Locks a job's row for the rest of the transaction, so two people can't act on it at once. */
async function lockJob(tx: Prisma.TransactionClient, jobId: string) {
  await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${jobId} FOR UPDATE`;
  return tx.job.findUnique({ where: { id: jobId } });
}

type JobFacts = Prisma.JobGetPayload<object>;

/** What an email says about a job, so people can act on it without opening the app first. */
function jobFacts(job: JobFacts): Detail[] {
  return [
    ["Job", job.title],
    ["Project", job.project],
    ["Language", job.language],
    ["Length", formatDuration(job.durationSeconds)],
    ["Pay", formatUGX(creditAmount(job.durationSeconds, job, null))],
    ["Deadline", job.deadline?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
  ];
}

/** Where a payment went, as the person entered it. */
async function payDestinations(userIds: string[]) {
  const people = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, payNetwork: true, payPhone: true, payName: true } });
  return new Map(people.map((p) => [p.id, [p.payNetwork, p.payPhone, p.payName && `(${p.payName})`].filter(Boolean).join(" ") || null]));
}

class Refused extends Error {}
/** Runs a transaction; a Refused thrown inside becomes the form's error message. */
async function guarded<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T | { error: string }> {
  try {
    return await db.$transaction(work);
  } catch (e) {
    if (e instanceof Refused) return { error: e.message };
    throw e;
  }
}
const refuse = (msg: string): never => {
  throw new Refused(msg);
};
const failed = (r: unknown): r is { error: string } => typeof r === "object" && r !== null && "error" in r;

// ---------- Admin: jobs ----------

export async function assignJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const res = await guarded(async (tx) => {
    const job = (await lockJob(tx, jobId)) ?? refuse("This job no longer exists.");
    if (job.status === "SUBMITTED") refuse("Send the job back before reassigning it.");
    if (assigneeId === (job.assigneeId ?? "")) refuse(assigneeId ? "It's already assigned to them." : "It's already unassigned.");
    if (assigneeId) {
      const person = await tx.user.findUnique({ where: { id: assigneeId }, select: { role: true } });
      if (person?.role !== "USER") refuse("Jobs can only go to transcribers.");
    }
    // Moving a job off someone takes back any pay they had for it, as leaving or unassigning does.
    if (job.assigneeId) {
      await lockPayments(tx);
      await tx.earning.deleteMany({ where: { jobId, userId: job.assigneeId } });
    }
    await tx.job.update({
      where: { id: jobId },
      data: assigneeId
        ? {
            assigneeId,
            status: "ASSIGNED",
            assignedAt: new Date(),
            posted: false,
            // Instructions were for the previous transcriber.
            reviewNote: null,
            reviewedAt: null,
            revisions: 0,
          }
        : { assigneeId: null, status: "UNASSIGNED", assignedAt: null },
    });
    const declined = assigneeId ? await settleRequests(tx, jobId, assigneeId) : [];
    return { job, declined };
  });
  if (failed(res)) return res;
  const { job, declined } = res;
  if (assigneeId) {
    const assigned = await db.job.findUnique({ where: { id: jobId } });
    await notify([assigneeId], { title: `New job assigned: ${job.title}`, href: `/jobs/${jobId}`, jobId, kind: "assigned", email: true, details: assigned ? jobFacts(assigned) : undefined });
  }
  if (job.assigneeId) await notify([job.assigneeId], { title: `${job.title} was taken off your list`, body: "An admin moved this job. You don't need to work on it any more.", href: "/jobs", jobId, email: true });
  await settleNotices(jobId);
  await notify(declined, { title: `${job.title} went to someone else`, body: "Thanks for asking. Check Find work for other jobs.", href: "/board", email: true });
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: assigneeId ? "Assignment saved." : "Job unassigned." };
}

/**
 * Moves a submitted or approved job, with its pay, to another transcriber as if they had done it. The previous
 * transcriber loses the job, its pay and its notices; payments already made to them stay recorded as they were.
 */
export async function transferJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const toId = String(formData.get("toId") ?? "");
  const res = await guarded(async (tx) => {
    await lockPayments(tx);
    const job = (await lockJob(tx, jobId)) ?? refuse("This job no longer exists.");
    if (job.status !== "SUBMITTED" || !job.assigneeId) refuse("Only submitted or completed jobs can be transferred.");
    if (toId === job.assigneeId) refuse("It's already theirs.");
    const to = await tx.user.findUnique({ where: { id: toId }, select: { id: true, name: true, role: true, referredById: true } });
    if (to?.role !== "USER") refuse("Pick a transcriber to transfer it to.");
    const from = job.assigneeId!;
    // Any old credit of theirs on this job is replaced by the transferred one.
    await tx.earning.deleteMany({ where: { jobId, userId: to!.id } });
    // The pay moves as is (same amount and rate), and the new person's referrer gets the referral share.
    await tx.earning.updateMany({ where: { jobId, userId: from }, data: { userId: to!.id, referrerId: to!.referredById } });
    await tx.job.update({ where: { id: jobId }, data: { assigneeId: to!.id } });
    await tx.jobRequest.deleteMany({ where: { jobId, userId: from } });
    await tx.notification.deleteMany({ where: { jobId, userId: from } });
    return { job, from, to: to! };
  });
  if (failed(res)) return res;
  const { job, from, to } = res;
  const done = job.approvedAt ? "It's approved, and its pay is now in your earnings." : "It's waiting for review. Its pay is added to your earnings once it's approved.";
  await notify([to.id], { title: `${job.title} was transferred to you`, body: done, href: `/jobs/${jobId}`, jobId, email: true, details: jobFacts(job) });
  await notify([from], { title: `${job.title} was moved to someone else`, body: "An admin transferred this job and its pay to another transcriber.", href: "/jobs", email: true });
  revalidatePath("/", "layout");
  return { ok: `Transferred to ${to.name}.` };
}

/** Once a job is assigned, the assignee's request (if any) is approved and the rest declined. Returns who was declined. */
async function settleRequests(tx: Prisma.TransactionClient, jobId: string, assigneeId: string) {
  const declined = await tx.jobRequest.findMany({ where: { jobId, userId: { not: assigneeId }, status: "PENDING" }, select: { userId: true } });
  await tx.jobRequest.updateMany({ where: { jobId, userId: assigneeId }, data: { status: "APPROVED" } });
  await tx.jobRequest.updateMany({ where: { jobId, userId: { not: assigneeId }, status: "PENDING" }, data: { status: "DECLINED" } });
  return declined.map((r) => r.userId);
}

const detailsSchema = z.object({
  title: z.string().trim().min(1, "Give the job a title"),
  description: z.string().trim().max(50000).default(""),
  language: z.string().trim().max(60).default(""),
  project: z.string().trim().max(80).default(""),
  deadline: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Enter a valid deadline").default(""),
});

export async function updateJobDetails(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { title, language, project, deadline } = parsed.data;
  const description = cleanRich(parsed.data.description);
  if (richText(description).length > 5000) return { error: "Keep the details under 5,000 characters." };
  const pricing = parsePricing(formData);
  if ("error" in pricing) return { error: pricing.error };
  const { ratePerHour, fixedPay } = pricing;
  const before = await db.job.findUnique({ where: { id: jobId }, select: { description: true } });
  if (!before) return { error: "This job no longer exists." };
  const instructionsChanged = before.description !== description;
  const job = await db.job.update({
    where: { id: jobId },
    data: {
      title, description, language: language || null, project: project.replace(/\s+/g, " ") || null, deadline: parseDeadline(deadline), ratePerHour, fixedPay,
      ...(instructionsChanged ? { instructionsUpdatedAt: new Date() } : {}),
    },
    include: { assignee: { select: { name: true } } },
  });
  // Whoever is working on it hears about new instructions; an approved job is finished, so nobody is told.
  const told = instructionsChanged && job.assigneeId && !job.approvedAt ? job.assignee?.name : null;
  if (told) {
    await notify([job.assigneeId!], {
      title: `Instructions updated: ${job.title}`,
      body: description ? "An admin changed the notes for this job. Open it to read them." : "An admin removed the notes for this job.",
      href: `/jobs/${jobId}`,
      jobId,
      kind: "instructions",
      email: true,
    });
  }
  // Keep pay already credited for this job in line with its pricing.
  for (const e of await db.earning.findMany({ where: { jobId } })) {
    await db.earning.update({ where: { id: e.id }, data: { customRate: hasOwnPay(job), amount: creditAmount(job.durationSeconds, job, e.lockedRate) } });
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/admin/users");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: told ? `Details saved. ${told} was told the instructions changed.` : "Details saved." };
}

export async function setPosted(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const posted = formData.get("posted") === "true";
  // Only an unassigned job can be on the board; the condition is checked in the same statement as the change.
  const { count } = await db.job.updateMany({ where: { id: jobId, ...(posted ? { status: "UNASSIGNED" } : {}) }, data: { posted } });
  if (!count) return { error: "Only unassigned jobs can go on the job board." };
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  revalidatePath("/board");
  return { ok: posted ? "Posted on the job board." : "Taken off the job board." };
}

/** Send a submitted job back to its assignee with instructions for what to change. Pay already credited stays. */
export async function reopenJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const note = cleanRich(String(formData.get("note") ?? ""));
  if (richText(note).length > 5000) return { error: "Keep the instructions under 5,000 characters." };
  if (!note) return { error: "Write what needs to change so the transcriber knows what to fix." };
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== "SUBMITTED") return { error: "Only submitted jobs can be sent back." };
  if (job.mediaRemovedAt) return { error: "The media file was removed, so this job can't be sent back." };
  if (!job.assigneeId) return { error: "Nobody is assigned to this job to send it back to." };
  // Conditional on the job still being as we just read it, so it can't be sent back twice or after it changed hands.
  const { count } = await db.job.updateMany({
    where: { id: jobId, status: "SUBMITTED", assigneeId: job.assigneeId, mediaRemovedAt: null },
    data: { status: "ASSIGNED", submittedAt: null, approvedAt: null, reviewNote: note, reviewedAt: new Date(), reviewNoteEditedAt: null, revisions: { increment: 1 } },
  });
  if (!count) return { error: "This job changed while you were looking at it. Reload and try again." };
  // No longer approved, so its pay goes back to today's rate until it's approved again.
  await db.earning.updateMany({ where: { jobId, customRate: false }, data: { lockedRate: null, amount: earningsFor(job.durationSeconds) } });
  await notify([job.assigneeId], { title: `Changes needed: ${job.title}`, body: richText(note), href: `/jobs/${jobId}`, jobId, kind: "sent-back", email: true });
  await settleNotices(jobId);
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: "Sent back with your instructions." };
}

/** Changes the notes on a job that was sent back, e.g. to add something the admin forgot. */
export async function updateReviewNote(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const note = cleanRich(String(formData.get("note") ?? ""));
  if (richText(note).length > 5000) return { error: "Keep the instructions under 5,000 characters." };
  if (!note) return { error: "The notes can't be empty. Write what needs to change." };
  const job = await db.job.findUnique({ where: { id: jobId }, include: { assignee: { select: { name: true } } } });
  if (!job) return { error: "This job no longer exists." };
  if (job.reviewNote === note) return { ok: "No changes to save." };
  // Only while the job is still back with the transcriber; once they resubmit, the notes are done with.
  const { count } = await db.job.updateMany({
    where: { id: jobId, status: "ASSIGNED", assigneeId: job.assigneeId, reviewNote: { not: null } },
    data: { reviewNote: note, reviewNoteEditedAt: new Date() },
  });
  if (!count) return { error: "This job isn't waiting on changes any more, so its notes can't be edited. Reload to see where it is." };
  await notify([job.assigneeId], { title: `Notes updated: ${job.title}`, body: `The admin changed what needs fixing. ${richText(note)}`, href: `/jobs/${jobId}`, jobId, kind: "sent-back", email: true });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: `Notes saved. ${job.assignee?.name ?? "The transcriber"} was told.` };
}

/** Marks a submitted job as reviewed and accepted. */
export async function approveJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const { count } = await db.job.updateMany({ where: { id: jobId, status: "SUBMITTED", approvedAt: null }, data: { approvedAt: new Date(), reviewedAt: new Date(), driveExportedAt: null, driveExportError: null } });
  if (!count) return { error: "Only submitted jobs that aren't approved yet can be approved." };
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  // Approved pay keeps today's usual rate even if the rate changes later.
  await db.earning.updateMany({ where: { jobId, customRate: false }, data: { lockedRate: RATE_PER_HOUR_UGX, amount: earningsFor(job.durationSeconds) } });
  await notify([job.assigneeId], { title: `Approved: ${job.title}`, body: "Your transcript was accepted, and its pay is now in your earnings.", href: `/jobs/${jobId}`, jobId, kind: "approved", email: true, details: jobFacts(job) });
  // The referrer's share of an approved job counts towards what they're owed from now on.
  const credit = job.assigneeId ? await db.earning.findUnique({ where: { jobId_userId: { jobId, userId: job.assigneeId } }, include: { user: { select: { name: true } } } }) : null;
  if (credit?.referrerId) {
    const share = credit.customRate ? referralPayFor(0, credit.amount) : referralPayFor(credit.seconds);
    await notify([credit.referrerId], {
      title: `You earned ${formatUGX(share)} in referral pay`,
      body: `${credit.user.name}, who you referred, had a transcript approved.`,
      href: "/earnings",
      email: true,
      details: [["Transcriber", credit.user.name], ["Length", formatDuration(credit.seconds)], ["Your share", formatUGX(share)]],
    });
  }
  await settleNotices(jobId);
  const toDrive = await exportLater([jobId]);
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: toDrive ? "Marked as approved. Copying it to Google Drive." : "Marked as approved." };
}

export async function updateDuration(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const minutes = Number(formData.get("minutes"));
  const seconds = Number(formData.get("seconds") ?? 0);
  const total = Math.round(minutes * 60 + seconds);
  if (!Number.isFinite(total) || total <= 0) return { error: "Length must be greater than zero." };
  if (total > 24 * 3600) return { error: "Length can't be more than 24 hours." };
  const job = await db.job.update({ where: { id: jobId }, data: { durationSeconds: total } });
  // Time already credited for this job follows the corrected length.
  for (const e of await db.earning.findMany({ where: { jobId } })) {
    await db.earning.update({ where: { id: e.id }, data: { seconds: total, amount: creditAmount(total, job, e.lockedRate) } });
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { ok: "Length updated." };
}

export async function removeEarning(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const earningId = String(formData.get("earningId"));
  const e = await db.earning.delete({ where: { id: earningId } });
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${e.jobId}`);
  revalidatePath("/admin/users");
  return { ok: "Pay removed." };
}

export async function deleteJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const credited = await db.earning.count({ where: { jobId } });
  if (credited) return { error: "This job has pay credited to someone. Remove that pay first, or keep the job." };
  const job = await db.job.delete({ where: { id: jobId } });
  await deleteMedia(job.mediaPath);
  if (job.assigneeId) await notify([job.assigneeId], { title: `${job.title} was cancelled`, body: "An admin deleted this job, so you don't need to work on it.", href: "/jobs", email: true });
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/jobs");
  redirect("/admin");
}

/** Deletes the media file of a submitted job to save space. The job, transcripts and pay stay. */
export async function removeJobMedia(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== "SUBMITTED") return { error: "Only submitted jobs can have their media removed." };
  if (!job.mediaRemovedAt) {
    await deleteMedia(job.mediaPath);
    await db.job.update({ where: { id: jobId }, data: { mediaRemovedAt: new Date() } });
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: "Media file removed. The transcript and pay records are kept." };
}

/** Removes the media files of every submitted job in one go. */
export async function removeAllSubmittedMedia(): Promise<FormState> {
  await requireAdmin();
  const jobs = await db.job.findMany({ where: { status: "SUBMITTED", mediaRemovedAt: null } });
  if (jobs.length === 0) return { error: "No submitted jobs have media left to remove." };
  for (const j of jobs) await deleteMedia(j.mediaPath);
  await db.job.updateMany({ where: { id: { in: jobs.map((j) => j.id) } }, data: { mediaRemovedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: `Removed ${jobs.length} media file${jobs.length === 1 ? "" : "s"}. Transcripts and pay records are kept.` };
}

// Files this new are left alone: they may belong to an upload that is still being finished or retried.
const LEFTOVER_AGE_MS = 6 * 60 * 60 * 1000;

/** Stored media files no job uses (e.g. an upload that failed and was never retried), and recordings stored for more than one job. */
async function storageCheck() {
  const [files, jobs] = await Promise.all([listStoredMedia(), db.job.findMany({ select: { id: true, title: true, mediaPath: true } })]);
  const jobsByFile = new Map<string, { id: string; title: string }[]>();
  for (const j of jobs) jobsByFile.set(publicIdOf(j.mediaPath), [...(jobsByFile.get(publicIdOf(j.mediaPath)) ?? []), { id: j.id, title: j.title }]);
  const leftovers = files.filter((f) => !jobsByFile.has(f.publicId) && Date.now() - f.createdAt.getTime() > LEFTOVER_AGE_MS);
  // Files with the same contents have the same checksum, so this also finds copies uploaded before duplicates were blocked.
  const byContents = new Map<string, { id: string; title: string }[]>();
  for (const f of files) {
    const used = jobsByFile.get(f.publicId);
    if (used) byContents.set(f.etag, [...(byContents.get(f.etag) ?? []), ...used]);
  }
  const copies = [...byContents.values()].filter((group) => group.length > 1);
  return { leftovers, copies };
}

export async function checkStorage(): Promise<{ leftovers: number; leftoverBytes: number; copies: { id: string; title: string }[][] } | { error: string }> {
  await requireAdmin();
  try {
    const { leftovers, copies } = await storageCheck();
    return { leftovers: leftovers.length, leftoverBytes: leftovers.reduce((n, f) => n + f.bytes, 0), copies };
  } catch (err) {
    console.error("Storage check failed", err);
    return { error: "Couldn't check storage. Try again in a minute." };
  }
}

/** Deletes stored media files that no job uses. Checks again first, so a file a job started using meanwhile is kept. */
export async function removeLeftoverMedia(): Promise<FormState> {
  await requireAdmin();
  const { leftovers } = await storageCheck();
  if (leftovers.length === 0) return { ok: "No unused files left." };
  for (const f of leftovers) await deleteMedia(f.name);
  revalidatePath("/admin");
  return { ok: `Removed ${leftovers.length} unused file${leftovers.length === 1 ? "" : "s"}.` };
}

// ---------- Admin: Google Drive export ----------

/** Copies one approved job to Drive again, e.g. after an export failed. */
export async function exportJobToDrive(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true, approvedAt: true } });
  if (!job || job.status !== "SUBMITTED" || !job.approvedAt) return { error: "Only approved jobs are copied to Google Drive." };
  await db.job.update({ where: { id: jobId }, data: { driveExportedAt: null, driveExportError: null } });
  if (!(await exportLater([jobId]))) return { error: "Connect Google Drive on the dashboard first." };
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: "Copying it to Google Drive. Reload in a minute to see it there." };
}

/** Copies every approved job that isn't in Drive yet, e.g. the ones approved before Drive was connected. */
export async function exportWaitingToDrive(): Promise<FormState> {
  await requireAdmin();
  const jobs = await waitingForDrive();
  if (!jobs.length) return { error: "Every approved job is already in Google Drive." };
  await db.job.updateMany({ where: { id: { in: jobs.map((j) => j.id) } }, data: { driveExportError: null } });
  if (!(await exportLater(jobs.map((j) => j.id)))) return { error: "Connect Google Drive first." };
  revalidatePath("/admin");
  return { ok: `Copying ${jobs.length} job${jobs.length === 1 ? "" : "s"} to Google Drive. This can take a few minutes for long recordings.` };
}

export async function disconnectGoogleDrive(): Promise<FormState> {
  await requireAdmin();
  await disconnectDrive();
  revalidatePath("/admin");
  return { ok: "Google Drive disconnected. Files already copied stay in Drive." };
}

// ---------- Admin: payouts ----------

export async function recordPayout(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const amount = Math.round(Number(formData.get("amount")));
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than zero." };
  const res = await guarded(async (tx) => {
    await lockPayments(tx);
    const problem = (await payProblems(tx)).find((p) => p.userId === userId);
    if (problem) refuse(`Fix the pay problem on ${problem.jobTitle} first: ${problem.problem}`);
    const owed = (await balancesByUser(tx)).get(userId)?.owed ?? 0;
    if (amount > owed) refuse(`That's more than they're owed (UGX ${Math.max(owed, 0).toLocaleString("en-US")}).`);
    await tx.payout.create({ data: { userId, amount, note } });
    return {};
  });
  if (failed(res)) return res;
  const paidTo = await payDestinations([userId]);
  await notify([userId], {
    title: `You were paid UGX ${amount.toLocaleString("en-US")}`,
    body: note,
    href: "/earnings",
    email: true,
    details: [["Amount", formatUGX(amount)], ["Sent to", paidTo.get(userId)], ["Date", formatPayDate(new Date().toISOString().slice(0, 10))]],
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: "Payment recorded." };
}

// ---------- Transcriber ----------

/**
 * A transcriber takes a job from the board. First come, first served: the job row is locked, so when two
 * people press at once the second finds it already taken.
 */
export async function claimJob(formData: FormData): Promise<FormState> {
  const user = await requireRole("USER");
  const jobId = String(formData.get("jobId"));
  const res = await guarded(async (tx) => {
    const job = await lockJob(tx, jobId);
    if (!job || !job.posted || job.status !== "UNASSIGNED") refuse("Someone else already took this job.");
    const claimed = await tx.job.update({
      where: { id: jobId },
      data: { assigneeId: user.id, status: "ASSIGNED", assignedAt: new Date(), posted: false, reviewNote: null, reviewedAt: null, revisions: 0 },
    });
    // Kept as the record of who took it, and so requests left from before go to the others.
    await tx.jobRequest.upsert({
      where: { jobId_userId: { jobId, userId: user.id } },
      create: { jobId, userId: user.id, status: "APPROVED" },
      update: { status: "APPROVED" },
    });
    const declined = await settleRequests(tx, jobId, user.id);
    return { job: claimed, declined };
  });
  if (failed(res)) {
    // Refresh the board so the job that was just taken disappears from it.
    revalidatePath("/board");
    return res;
  }
  const { job, declined } = res;
  const inProgress = await db.job.count({ where: { assigneeId: user.id, status: "ASSIGNED" } });
  await notifyAdmins({
    title: `${user.name} took ${job.title}`,
    body: "It went to them straight from Find work. You can unassign or move it from the job page.",
    href: `/admin/jobs/${jobId}`,
    jobId,
    email: true,
    details: [
      ["Taken by", `${user.name} (${user.email})`],
      ["Their languages", user.languages.join(", ")],
      ["Jobs in progress", inProgress],
      ...jobFacts(job),
    ],
  });
  await notify(declined, { title: `${job.title} went to someone else`, body: "Another transcriber took it first. Check Find work for other jobs.", href: "/board", email: true });
  await settleNotices(jobId);
  revalidatePath("/board");
  revalidatePath("/jobs");
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: "It's yours. You'll find it in My jobs." };
}

/** Formatted transcripts are cleaned before they are stored; plain ones are kept as typed. */
async function cleanTranscript(jobId: string, text: string) {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { transcriptFormat: true } });
  return job?.transcriptFormat === "html" ? { text: cleanDoc(text), words: docText(text) } : { text, words: text };
}

export async function saveDraft(jobId: string, raw: string): Promise<FormState> {
  const user = await requireUser();
  if (raw.length > MAX_TRANSCRIPT) return { error: "The transcript is too long to save." };
  const { text } = await cleanTranscript(jobId, raw);
  const { count } = await db.job.updateMany({ where: { id: jobId, assigneeId: user.id, status: "ASSIGNED" }, data: { editedTranscript: text } });
  if (!count) return { error: "This job is no longer open for editing. It may have been submitted or moved to someone else." };
  return { ok: "Draft saved." };
}

const MAX_TRANSCRIPT = 2_000_000;

export async function submitJob(jobId: string, raw: string, fileName?: string): Promise<FormState> {
  const user = await requireUser();
  if (raw.length > MAX_TRANSCRIPT) return { error: "The transcript is too long to save." };
  const { text, words } = await cleanTranscript(jobId, raw);
  if (!words.trim()) return { error: "The transcript is empty." };
  const res = await guarded(async (tx) => {
    const job = await lockJob(tx, jobId);
    if (!job || job.assigneeId !== user.id) refuse("This job isn't assigned to you any more.");
    if (job!.status !== "ASSIGNED") refuse("This job has already been submitted.");
    const resubmission = (await tx.earning.count({ where: { jobId, userId: user.id } })) > 0;
    await tx.job.update({ where: { id: jobId }, data: { editedTranscript: text, status: "SUBMITTED", submittedAt: new Date() } });
    // Credit pay once per job and user; a resubmission after a reopen doesn't pay again.
    await tx.earning.upsert({
      where: { jobId_userId: { jobId, userId: user.id } },
      create: {
        jobId,
        userId: user.id,
        amount: creditAmount(job!.durationSeconds, job!, null),
        seconds: job!.durationSeconds,
        customRate: hasOwnPay(job!),
        referrerId: user.referredById,
      },
      update: {},
    });
    return { ...job!, resubmission };
  });
  if (failed(res)) return res;
  await notifyAdmins({
    title: `${user.name} ${res.resubmission ? "resubmitted" : "submitted"} ${res.title}`,
    body: [res.reviewNote ? "Resubmitted after your changes." : res.resubmission ? "Replaced their earlier submission." : null, fileName ? `Uploaded as a file (${fileName.slice(0, 100)}).` : null, "Ready to review."].filter(Boolean).join(" "),
    href: `/admin/jobs/${jobId}#review`,
    jobId,
    kind: "submitted",
    email: true,
    details: [["Submitted by", user.name], ...jobFacts(res), ["Times sent back", res.revisions || null]],
  });
  await settleNotices(jobId);
  revalidatePath("/jobs");
  revalidatePath("/earnings");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  redirect(`/jobs?submitted=${jobId}`);
}

/** Takes back a submission the admin hasn't reviewed yet, so it can be edited and resubmitted. Pay already credited stays. */
export async function withdrawSubmission(formData: FormData): Promise<FormState> {
  const user = await requireRole("USER");
  const jobId = String(formData.get("jobId"));
  // Unsubmitting takes back the pay added on submit; submitting again adds it once more.
  const res = await guarded(async (tx) => {
    const job = await lockJob(tx, jobId);
    await lockPayments(tx);
    if (!job || job.assigneeId !== user.id || job.status !== "SUBMITTED" || job.approvedAt || job.mediaRemovedAt) {
      refuse("This submission can't be changed any more. The admin may have already reviewed it.");
    }
    await tx.job.update({ where: { id: jobId }, data: { status: "ASSIGNED", submittedAt: null } });
    await tx.earning.deleteMany({ where: { jobId, userId: user.id } });
    return job!;
  });
  if (failed(res)) return res;
  await notifyAdmins({ title: `${user.name} unsubmitted ${res.title}`, body: "They're fixing a mistake and will submit it again. No need to review it yet.", href: `/admin/jobs/${jobId}`, jobId, kind: "unsubmitted" });
  await settleNotices(jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/earnings");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  return { ok: "Unsubmitted. Fix it and submit again when you're done." };
}

// ---------- Notifications ----------

export async function markAllNotificationsRead(): Promise<FormState> {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  return { ok: "All caught up." };
}

/** Saves the transcription guidelines shown on every job. */
export async function updateGuidelines(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const html = cleanRich(String(formData.get("guidelines") ?? ""));
  if (richText(html).length > 10000) return { error: "Keep the guidelines under 10,000 characters." };
  if ((await getGuidelinesInfo()).html === html) return { ok: "No changes to save." };
  await setGuidelines(html);
  // Tell everyone with a job still open, so nobody keeps working from the old rules.
  let told = 0;
  if (formData.get("tell") === "on") {
    const open = await db.job.findMany({ where: { assigneeId: { not: null }, approvedAt: null }, select: { assigneeId: true }, distinct: ["assigneeId"] });
    const ids = open.map((j) => j.assigneeId!);
    told = ids.length;
    if (ids.length) await notify(ids, { title: "Transcription guidelines updated", body: html ? "An admin changed the guidelines that apply to every job. Read them before you carry on." : "An admin removed the general guidelines.", href: "/guidelines", email: true });
  }
  revalidatePath("/", "layout");
  const who = told ? ` ${told} transcriber${told === 1 ? " was" : "s were"} told.` : "";
  return { ok: (html ? "Guidelines saved. Every job now shows them." : "Guidelines removed.") + who };
}

// ---------- Leaving and unassigning ----------

/**
 * Takes a job off its transcriber and puts it back on Find work. Their draft edits stay for whoever
 * takes it next, and pay credited to them for it is removed. Call with the job row locked.
 */
async function releaseJob(tx: Prisma.TransactionClient, job: { id: string; assigneeId: string | null }) {
  if (!job.assigneeId) return;
  await lockPayments(tx);
  await tx.earning.deleteMany({ where: { jobId: job.id, userId: job.assigneeId } });
  // Their old request is closed, so they could ask for the job again later.
  await tx.jobRequest.updateMany({ where: { jobId: job.id, userId: job.assigneeId }, data: { status: "DECLINED" } });
  await tx.job.update({
    where: { id: job.id },
    data: { assigneeId: null, status: "UNASSIGNED", assignedAt: null, submittedAt: null, approvedAt: null, reviewNote: null, reviewedAt: null, revisions: 0, posted: true },
  });
}

function revalidateRelease(jobId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/board");
  revalidatePath("/jobs");
  revalidatePath("/earnings");
}

/** A transcriber gives back a job they can't finish. */
export async function leaveJob(formData: FormData): Promise<FormState> {
  const user = await requireRole("USER");
  const jobId = String(formData.get("jobId"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  const res = await guarded(async (tx) => {
    const job = await lockJob(tx, jobId);
    if (!job || job.assigneeId !== user.id) refuse("This job isn't assigned to you any more.");
    if (job!.status === "SUBMITTED") refuse(job!.approvedAt ? "This job is already approved, so it can't be left." : "Withdraw your submission first, then you can leave the job.");
    if (job!.mediaRemovedAt) refuse("This job's media was removed, so it can't go back on the board.");
    await releaseJob(tx, job!);
    return job!;
  });
  if (failed(res)) return res;
  await notifyAdmins({ title: `${user.name} left ${res.title}`, body: `${reason || "No reason given."} It's back on Find work.`, href: `/admin/jobs/${jobId}`, jobId, email: true, details: jobFacts(res) });
  await settleNotices(jobId);
  revalidateRelease(jobId);
  return { ok: "You've left the job. It's back on Find work for others." };
}

/** An admin takes a job off its transcriber and puts it back on Find work. */
export async function unassignJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  const res = await guarded(async (tx) => {
    const job = (await lockJob(tx, jobId)) ?? refuse("This job no longer exists.");
    if (!job.assigneeId) refuse("Nobody is assigned to this job.");
    if (job.status === "SUBMITTED" && job.approvedAt) refuse("This job is approved. Send it back first if it needs more work.");
    if (job.mediaRemovedAt) refuse("This job's media was removed, so it can't go back on the board.");
    await releaseJob(tx, job);
    return job;
  });
  if (failed(res)) return res;
  await notify([res.assigneeId!], {
    title: `${res.title} was taken off your list`,
    body: reason || "An admin unassigned this job. You don't need to work on it any more.",
    href: "/jobs",
    jobId,
    email: true,
  });
  await settleNotices(jobId);
  revalidateRelease(jobId);
  return { ok: "Unassigned. The job is back on Find work." };
}

// ---------- Issues ----------

const issueSchema = z.object({
  subject: z.string().trim().min(1, "Say briefly what the problem is").max(120, "Keep the subject under 120 characters"),
  body: z.string().trim().min(1, "Describe the problem").max(3000, "Keep the message under 3,000 characters"),
});

function revalidateIssue(jobId: string, issueId?: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/issues");
  if (issueId) revalidatePath(`/admin/issues/${issueId}`);
  revalidatePath("/admin");
}

/** A transcriber raises a problem with a job assigned to them. */
export async function raiseIssue(formData: FormData): Promise<FormState> {
  const user = await requireRole("USER");
  const jobId = String(formData.get("jobId"));
  const parsed = issueSchema.safeParse({ subject: formData.get("subject") ?? "", body: formData.get("body") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const job = await db.job.findUnique({ where: { id: jobId }, select: { title: true, assigneeId: true } });
  if (!job || job.assigneeId !== user.id) return { error: "You can only raise issues on jobs assigned to you." };
  const { subject, body } = parsed.data;
  const issue = await db.issue.create({ data: { jobId, userId: user.id, subject, messages: { create: { authorId: user.id, body } } } });
  await notifyAdmins({ title: `${user.name} raised an issue: ${subject}`, body: `${job.title}: ${body}`, href: `/admin/issues/${issue.id}`, email: true });
  revalidateIssue(jobId, issue.id);
  return { ok: "Issue sent. You'll be notified when an admin replies." };
}

/** Adds a reply to an issue. Admins can resolve it in the same step; any other reply reopens it. */
export async function replyToIssue(formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const issueId = String(formData.get("issueId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a reply first." };
  if (body.length > 3000) return { error: "Keep the message under 3,000 characters." };
  const issue = await db.issue.findUnique({ where: { id: issueId }, include: { job: { select: { title: true, assigneeId: true } } } });
  const admin = user.role === "ADMIN";
  if (!issue || (!admin && issue.userId !== user.id)) return { error: "This issue no longer exists." };
  if (!admin && issue.job.assigneeId !== user.id) return { error: "This job isn't assigned to you any more." };
  const resolve = admin && formData.get("resolve") === "on";
  await db.issue.update({
    where: { id: issueId },
    data: { messages: { create: { authorId: user.id, body } }, status: resolve ? "RESOLVED" : "OPEN", resolvedAt: resolve ? new Date() : null },
  });
  if (admin) {
    await notify([issue.userId], {
      title: `${resolve ? "Resolved" : "Reply"}: ${issue.subject}`,
      body,
      href: `/jobs/${issue.jobId}#issue-${issueId}`,
      email: true,
    });
  } else {
    await notifyAdmins({ title: `${user.name} replied: ${issue.subject}`, body: `${issue.job.title}: ${body}`, href: `/admin/issues/${issueId}`, email: true });
  }
  revalidateIssue(issue.jobId, issueId);
  return { ok: resolve ? "Reply sent and issue resolved." : "Reply sent." };
}

/** An admin marks an issue resolved, or reopens it. */
export async function setIssueStatus(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const issueId = String(formData.get("issueId"));
  const status = formData.get("status") === "RESOLVED" ? "RESOLVED" : "OPEN";
  const { count } = await db.issue.updateMany({
    where: { id: issueId, status: status === "RESOLVED" ? "OPEN" : "RESOLVED" },
    data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
  });
  if (!count) return { error: "This issue changed while you were looking at it. Reload and try again." };
  const issue = await db.issue.findUniqueOrThrow({ where: { id: issueId } });
  await notify([issue.userId], {
    title: `${status === "RESOLVED" ? "Resolved" : "Reopened"}: ${issue.subject}`,
    body: status === "RESOLVED" ? "An admin marked your issue as resolved." : "An admin reopened your issue.",
    href: `/jobs/${issue.jobId}#issue-${issueId}`,
    email: true,
  });
  revalidateIssue(issue.jobId, issueId);
  return { ok: status === "RESOLVED" ? "Marked resolved." : "Issue reopened." };
}
