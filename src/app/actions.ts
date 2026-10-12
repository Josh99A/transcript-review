"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, homeFor, requireAdmin, requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatPayDate, parseDeadline } from "@/lib/format";
import { notify, notifyAdmins } from "@/lib/notify";
import { earningsFor, parseFixedPay } from "@/lib/pay";
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
  if (referredById && !(await db.user.findFirst({ where: { id: referredById, role: "REFERRER" } })))
    return { error: "Pick a referrer from the list." };
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
export async function setReferrer(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const referredById = String(formData.get("referredById") ?? "") || null;
  const t = await db.user.findUnique({ where: { id: userId } });
  if (!t || t.role !== "USER") return { error: "Only transcribers can have a referrer." };
  if (referredById && !(await db.user.findFirst({ where: { id: referredById, role: "REFERRER" } })))
    return { error: "Pick a referrer from the list." };
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
  const [balances, payDate, people] = await Promise.all([
    balancesByUser(),
    getNextPayDate(),
    db.user.findMany({ where: { role: { in: ["USER", "REFERRER"] } }, select: { id: true } }),
  ]);
  const note = payDate ? `Pay run ${formatPayDate(payDate)}` : "Pay run";
  const payouts = people
    .map((p) => ({ userId: p.id, amount: balances.get(p.id)?.owed ?? 0, note }))
    .filter((p) => p.amount > 0);
  if (payouts.length === 0) return { error: "Nobody is owed anything right now." };
  await db.payout.createMany({ data: payouts });
  await Promise.all(payouts.map((p) => notify([p.userId], { title: `You were paid UGX ${p.amount.toLocaleString("en-US")}`, body: note, href: "/earnings" })));
  revalidatePath("/", "layout");
  const total = payouts.reduce((s, p) => s + p.amount, 0);
  return { ok: `Recorded ${payouts.length} payment${payouts.length === 1 ? "" : "s"} totalling UGX ${total.toLocaleString("en-US")}.` };
}

// ---------- Admin: jobs ----------

export async function assignJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "SUBMITTED") return { error: "Send the job back before reassigning it." };
  await db.job.update({
    where: { id: jobId },
    data: assigneeId
      ? {
          assigneeId,
          status: "ASSIGNED",
          assignedAt: new Date(),
          posted: false,
          // Instructions were for the previous transcriber.
          ...(assigneeId !== job.assigneeId ? { reviewNote: null, reviewedAt: null, revisions: 0 } : {}),
        }
      : { assigneeId: null, status: "UNASSIGNED", assignedAt: null },
  });
  if (assigneeId) await settleRequests(jobId, assigneeId);
  if (assigneeId && assigneeId !== job.assigneeId) await notify([assigneeId], { title: `New job assigned: ${job.title}`, href: `/jobs/${jobId}` });
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: assigneeId ? "Assignment saved." : "Job unassigned." };
}

/** Once a job is assigned, the assignee's request (if any) is approved and the rest declined. */
async function settleRequests(jobId: string, assigneeId: string) {
  const [declined, job] = await Promise.all([
    db.jobRequest.findMany({ where: { jobId, userId: { not: assigneeId }, status: "PENDING" }, select: { userId: true } }),
    db.job.findUniqueOrThrow({ where: { id: jobId }, select: { title: true } }),
  ]);
  await notify(declined.map((r) => r.userId), { title: `${job.title} went to someone else`, body: "Thanks for asking. Check Find work for other jobs.", href: "/board" });
  await db.$transaction([
    db.jobRequest.updateMany({ where: { jobId, userId: assigneeId }, data: { status: "APPROVED" } }),
    db.jobRequest.updateMany({ where: { jobId, userId: { not: assigneeId }, status: "PENDING" }, data: { status: "DECLINED" } }),
  ]);
}

const detailsSchema = z.object({
  title: z.string().trim().min(1, "Give the job a title"),
  description: z.string().trim().max(5000).default(""),
  language: z.string().trim().max(60).default(""),
  deadline: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Enter a valid deadline").default(""),
});

export async function updateJobDetails(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { title, description, language, deadline } = parsed.data;
  const fixedPay = parseFixedPay(formData.get("fixedPay"));
  if (fixedPay === "invalid") return { error: "Enter the fixed price as a whole number of shillings, or leave it empty." };
  const job = await db.job.update({
    where: { id: jobId },
    data: { title, description, language: language || null, deadline: parseDeadline(deadline), fixedPay },
  });
  // Keep pay already credited for this job in line with its pricing.
  await db.earning.updateMany({
    where: { jobId },
    data: { fixed: fixedPay != null, amount: fixedPay ?? earningsFor(job.durationSeconds) },
  });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/admin/users");
  return { ok: "Details saved." };
}

/** Puts an unassigned job on the job board, or takes it off. */
export async function setPosted(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const posted = formData.get("posted") === "true";
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (posted && job.status !== "UNASSIGNED") return { error: "Only unassigned jobs can go on the job board." };
  await db.job.update({ where: { id: jobId }, data: { posted } });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  revalidatePath("/board");
  return { ok: posted ? "Posted on the job board." : "Taken off the job board." };
}

export async function approveRequest(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const request = await db.jobRequest.findUniqueOrThrow({ where: { id: String(formData.get("requestId")) }, include: { job: true, user: true } });
  if (request.job.status !== "UNASSIGNED") return { error: "This job has already been assigned." };
  await db.job.update({
    where: { id: request.jobId },
    data: { assigneeId: request.userId, status: "ASSIGNED", assignedAt: new Date(), posted: false },
  });
  await settleRequests(request.jobId, request.userId);
  await notify([request.userId], { title: `Your request was approved: ${request.job.title}`, body: "It's now in My jobs.", href: `/jobs/${request.jobId}` });
  revalidatePath(`/admin/jobs/${request.jobId}`);
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/admin/requests");
  return { ok: `Assigned to ${request.user.name}.` };
}

export async function declineRequest(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const request = await db.jobRequest.update({ where: { id: String(formData.get("requestId")) }, data: { status: "DECLINED" }, include: { job: { select: { title: true } } } });
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
  const note = String(formData.get("note") ?? "").trim().slice(0, 5000);
  if (!note) return { error: "Write what needs to change so the transcriber knows what to fix." };
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== "SUBMITTED") return { error: "Only submitted jobs can be sent back." };
  if (job.mediaRemovedAt) return { error: "The media file was removed, so this job can't be sent back." };
  await db.job.update({
    where: { id: jobId },
    data: {
      status: job.assigneeId ? "ASSIGNED" : "UNASSIGNED",
      submittedAt: null,
      approvedAt: null,
      reviewNote: note,
      reviewedAt: new Date(),
      revisions: { increment: 1 },
    },
  });
  await notify([job.assigneeId], { title: `Changes needed: ${job.title}`, body: note, href: `/jobs/${jobId}` });
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: "Sent back with your instructions." };
}

/** Marks a submitted job as reviewed and accepted. */
export async function approveJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== "SUBMITTED") return { error: "Only submitted jobs can be approved." };
  await db.job.update({ where: { id: jobId }, data: { approvedAt: new Date(), reviewedAt: new Date() } });
  await notify([job.assigneeId], { title: `Approved: ${job.title}`, body: "Your transcript was accepted.", href: `/jobs/${jobId}` });
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
  await db.job.update({ where: { id: jobId }, data: { durationSeconds: total } });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
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
  const job = await db.job.delete({ where: { id: jobId } });
  await deleteMedia(job.mediaPath);
  revalidatePath("/admin");
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
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than zero." };
  await db.payout.create({ data: { userId, amount, note } });
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
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || !job.posted || job.status !== "UNASSIGNED") return { error: "This job is no longer available." };
  await db.jobRequest.upsert({
    where: { jobId_userId: { jobId, userId: user.id } },
    create: { jobId, userId: user.id, note },
    update: { note, status: "PENDING" },
  });
  await notifyAdmins({ title: `${user.name} requested ${job.title}`, body: note, href: "/admin/requests" });
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

async function loadOwnJob(jobId: string) {
  const user = await requireUser();
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.assigneeId !== user.id) throw new Error("This job isn't assigned to you.");
  if (job.status !== "ASSIGNED") throw new Error("This job has already been submitted.");
  return { user, job };
}

export async function saveDraft(jobId: string, text: string): Promise<FormState> {
  try {
    await loadOwnJob(jobId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await db.job.update({ where: { id: jobId }, data: { editedTranscript: text } });
  return { ok: "Draft saved." };
}

export async function submitJob(jobId: string, text: string): Promise<FormState> {
  let ctx;
  try {
    ctx = await loadOwnJob(jobId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { user, job } = ctx;
  if (!text.trim()) return { error: "The transcript is empty." };
  await db.$transaction([
    db.job.update({
      where: { id: jobId },
      data: { editedTranscript: text, status: "SUBMITTED", submittedAt: new Date() },
    }),
    // Credit pay once per job and user; a resubmission after a reopen doesn't pay again.
    db.earning.upsert({
      where: { jobId_userId: { jobId, userId: user.id } },
      create: {
        jobId,
        userId: user.id,
        amount: job.fixedPay ?? earningsFor(job.durationSeconds),
        seconds: job.durationSeconds,
        fixed: job.fixedPay != null,
        referrerId: user.referredById,
      },
      update: {},
    }),
  ]);
  await notifyAdmins({
    title: `${user.name} submitted ${job.title}`,
    body: job.revisions > 0 ? "Resubmitted after your changes. Ready to review." : "Ready to review.",
    href: `/admin/jobs/${jobId}`,
  });
  revalidatePath("/jobs");
  revalidatePath("/earnings");
  revalidatePath("/admin");
  redirect("/jobs?submitted=1");
}

// ---------- Notifications ----------

export async function markAllNotificationsRead(): Promise<FormState> {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  return { ok: "All caught up." };
}
