"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { cleanRich, richText } from "@/lib/richtext";
import { setGuidelines } from "@/lib/guidelines";
import { createSession, destroySession, homeFor, requireAdmin, requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatPayDate, parseDeadline } from "@/lib/format";
import { notify, notifyAdmins } from "@/lib/notify";
import { earningsFor, parseRate } from "@/lib/pay";
import { normalizePhone, PAY_NETWORKS } from "@/lib/payment";
import { getNextPayDate, setNextPayDate } from "@/lib/settings";
import { deleteMedia } from "@/lib/media";

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
    const [balances, people] = await Promise.all([
      balancesByUser(tx),
      tx.user.findMany({ where: { role: { in: ["USER", "REFERRER"] } }, select: { id: true } }),
    ]);
    const rows = people.map((p) => ({ userId: p.id, amount: balances.get(p.id)?.owed ?? 0, note })).filter((p) => p.amount > 0);
    if (rows.length) await tx.payout.createMany({ data: rows });
    return rows;
  });
  if (payouts.length === 0) return { error: "Nobody is owed anything right now." };
  await Promise.all(payouts.map((p) => notify([p.userId], { title: `You were paid UGX ${p.amount.toLocaleString("en-US")}`, body: note, href: "/earnings" })));
  revalidatePath("/", "layout");
  const total = payouts.reduce((s, p) => s + p.amount, 0);
  return { ok: `Recorded ${payouts.length} payment${payouts.length === 1 ? "" : "s"} totalling UGX ${total.toLocaleString("en-US")}.` };
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
  if (assigneeId) await notify([assigneeId], { title: `New job assigned: ${job.title}`, href: `/jobs/${jobId}` });
  if (job.assigneeId) await notify([job.assigneeId], { title: `${job.title} was taken off your list`, body: "An admin moved this job. You don't need to work on it any more.", href: "/jobs" });
  await notify(declined, { title: `${job.title} went to someone else`, body: "Thanks for asking. Check Find work for other jobs.", href: "/board" });
  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  revalidatePath("/board");
  revalidatePath("/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: assigneeId ? "Assignment saved." : "Job unassigned." };
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
  const ratePerHour = parseRate(formData.get("ratePerHour"));
  if (ratePerHour === "invalid") return { error: "Enter the rate as a whole number of shillings per hour, or leave it empty." };
  const job = await db.job.update({
    where: { id: jobId },
    data: { title, description, language: language || null, project: project.replace(/\s+/g, " ") || null, deadline: parseDeadline(deadline), ratePerHour },
  });
  // Keep pay already credited for this job in line with its pricing.
  await db.earning.updateMany({
    where: { jobId },
    data: { customRate: ratePerHour != null, amount: earningsFor(job.durationSeconds, ratePerHour ?? undefined) },
  });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/admin/users");
  return { ok: "Details saved." };
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

export async function approveRequest(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const requestId = String(formData.get("requestId"));
  const res = await guarded(async (tx) => {
    const request = (await tx.jobRequest.findUnique({ where: { id: requestId }, include: { user: true } })) ?? refuse("This request was withdrawn.");
    const job = (await lockJob(tx, request.jobId)) ?? refuse("This job no longer exists.");
    if (job.status !== "UNASSIGNED") refuse("This job has already been assigned.");
    const fresh = await tx.jobRequest.findUnique({ where: { id: requestId } });
    if (fresh?.status !== "PENDING") refuse(fresh ? "This request was already answered." : "This request was withdrawn.");
    await tx.job.update({
      where: { id: job.id },
      data: { assigneeId: request.userId, status: "ASSIGNED", assignedAt: new Date(), posted: false, reviewNote: null, reviewedAt: null, revisions: 0 },
    });
    const declined = await settleRequests(tx, job.id, request.userId);
    return { request, job, declined };
  });
  if (failed(res)) return res;
  const { request, job, declined } = res;
  await notify([request.userId], { title: `Your request was approved: ${job.title}`, body: "It's now in My jobs.", href: `/jobs/${job.id}` });
  await notify(declined, { title: `${job.title} went to someone else`, body: "Thanks for asking. Check Find work for other jobs.", href: "/board" });
  revalidatePath(`/admin/jobs/${job.id}`);
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/admin/requests");
  return { ok: `Assigned to ${request.user.name}.` };
}

export async function declineRequest(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const requestId = String(formData.get("requestId"));
  const { count } = await db.jobRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "DECLINED" } });
  if (!count) return { error: "This request was already answered or withdrawn." };
  const request = await db.jobRequest.findUniqueOrThrow({ where: { id: requestId }, include: { job: { select: { title: true } } } });
  await notify([request.userId], { title: `Your request wasn't approved: ${request.job.title}`, body: "Check Find work for other jobs.", href: "/board" });
  revalidatePath(`/admin/jobs/${request.jobId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  return { ok: "Request declined." };
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
    data: { status: "ASSIGNED", submittedAt: null, approvedAt: null, reviewNote: note, reviewedAt: new Date(), revisions: { increment: 1 } },
  });
  if (!count) return { error: "This job changed while you were looking at it. Reload and try again." };
  await notify([job.assigneeId], { title: `Changes needed: ${job.title}`, body: richText(note).slice(0, 500), href: `/jobs/${jobId}` });
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: "Sent back with your instructions." };
}

/** Marks a submitted job as reviewed and accepted. */
export async function approveJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const { count } = await db.job.updateMany({ where: { id: jobId, status: "SUBMITTED", approvedAt: null }, data: { approvedAt: new Date(), reviewedAt: new Date() } });
  if (!count) return { error: "Only submitted jobs that aren't approved yet can be approved." };
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  await notify([job.assigneeId], { title: `Approved: ${job.title}`, body: "Your transcript was accepted.", href: `/jobs/${jobId}` });
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: "Marked as approved." };
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
  await db.earning.updateMany({ where: { jobId }, data: { seconds: total, amount: earningsFor(total, job.ratePerHour ?? undefined) } });
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
  if (job.assigneeId) await notify([job.assigneeId], { title: `${job.title} was cancelled`, body: "An admin deleted this job, so you don't need to work on it.", href: "/jobs" });
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

// ---------- Admin: payouts ----------

export async function recordPayout(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const amount = Math.round(Number(formData.get("amount")));
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than zero." };
  const res = await guarded(async (tx) => {
    await lockPayments(tx);
    const owed = (await balancesByUser(tx)).get(userId)?.owed ?? 0;
    if (amount > owed) refuse(`That's more than they're owed (UGX ${Math.max(owed, 0).toLocaleString("en-US")}).`);
    await tx.payout.create({ data: { userId, amount, note } });
    return {};
  });
  if (failed(res)) return res;
  await notify([userId], { title: `You were paid UGX ${amount.toLocaleString("en-US")}`, body: note, href: "/earnings" });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: "Payment recorded." };
}

// ---------- Transcriber ----------

/** A transcriber asks to take a job from the board. */
export async function requestJob(formData: FormData): Promise<FormState> {
  const user = await requireRole("USER");
  const jobId = String(formData.get("jobId"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const res = await guarded(async (tx) => {
    // Locked so an assignment can't land between the check and the request.
    const job = await lockJob(tx, jobId);
    if (!job || !job.posted || job.status !== "UNASSIGNED") refuse("This job is no longer available.");
    const existing = await tx.jobRequest.findUnique({ where: { jobId_userId: { jobId, userId: user.id } } });
    if (existing?.status === "PENDING") refuse("You've already asked for this job.");
    await tx.jobRequest.upsert({
      where: { jobId_userId: { jobId, userId: user.id } },
      create: { jobId, userId: user.id, note },
      update: { note, status: "PENDING" },
    });
    return job!;
  });
  if (failed(res)) return res;
  await notifyAdmins({ title: `${user.name} requested ${res.title}`, body: note, href: "/admin/requests" });
  revalidatePath("/board");
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: "Request sent. You'll find the job in My jobs once an admin approves it." };
}

export async function cancelRequest(formData: FormData): Promise<FormState> {
  const user = await requireRole("USER");
  const jobId = String(formData.get("jobId"));
  await db.jobRequest.deleteMany({ where: { jobId, userId: user.id, status: "PENDING" } });
  revalidatePath("/board");
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: "Request withdrawn." };
}

export async function saveDraft(jobId: string, text: string): Promise<FormState> {
  const user = await requireUser();
  if (text.length > MAX_TRANSCRIPT) return { error: "The transcript is too long to save." };
  const { count } = await db.job.updateMany({ where: { id: jobId, assigneeId: user.id, status: "ASSIGNED" }, data: { editedTranscript: text } });
  if (!count) return { error: "This job is no longer open for editing. It may have been submitted or moved to someone else." };
  return { ok: "Draft saved." };
}

const MAX_TRANSCRIPT = 2_000_000;

export async function submitJob(jobId: string, text: string, fileName?: string): Promise<FormState> {
  const user = await requireUser();
  if (!text.trim()) return { error: "The transcript is empty." };
  if (text.length > MAX_TRANSCRIPT) return { error: "The transcript is too long to save." };
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
        amount: earningsFor(job!.durationSeconds, job!.ratePerHour ?? undefined),
        seconds: job!.durationSeconds,
        customRate: job!.ratePerHour != null,
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
  });
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
  const { count } = await db.job.updateMany({
    where: { id: jobId, assigneeId: user.id, status: "SUBMITTED", approvedAt: null, mediaRemovedAt: null },
    data: { status: "ASSIGNED", submittedAt: null },
  });
  if (!count) return { error: "This submission can't be changed any more. The admin may have already reviewed it." };
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  return { ok: "You can edit it again. Submit when you're done." };
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
  await setGuidelines(html);
  revalidatePath("/", "layout");
  return { ok: html ? "Guidelines saved. Every job now shows them." : "Guidelines removed." };
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
  revalidatePath("/admin/requests");
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
  await notifyAdmins({ title: `${user.name} left ${res.title}`, body: `${reason || "No reason given."} It's back on Find work.`, href: `/admin/jobs/${jobId}` });
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
  });
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
  await notifyAdmins({ title: `${user.name} raised an issue: ${subject}`, body: `${job.title}: ${body.slice(0, 300)}`, href: `/admin/issues/${issue.id}` });
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
      body: body.slice(0, 300),
      href: `/jobs/${issue.jobId}#issue-${issueId}`,
    });
  } else {
    await notifyAdmins({ title: `${user.name} replied: ${issue.subject}`, body: `${issue.job.title}: ${body.slice(0, 300)}`, href: `/admin/issues/${issueId}` });
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
  });
  revalidateIssue(issue.jobId, issueId);
  return { ok: status === "RESOLVED" ? "Marked resolved." : "Issue reopened." };
}
