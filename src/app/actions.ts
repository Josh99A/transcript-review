"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, homeFor, requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatPayDate } from "@/lib/format";
import { earningsFor } from "@/lib/pay";
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
      ? { assigneeId, status: "ASSIGNED", assignedAt: new Date() }
      : { assigneeId: null, status: "UNASSIGNED", assignedAt: null },
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: assigneeId ? "Assignment saved." : "Job unassigned." };
}

/** Send a submitted job back to its assignee for more corrections. Pay already credited stays. */
export async function reopenJob(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const jobId = String(formData.get("jobId"));
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  await db.job.update({
    where: { id: jobId },
    data: { status: job.assigneeId ? "ASSIGNED" : "UNASSIGNED", submittedAt: null },
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: "Sent back for more corrections." };
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

// ---------- Admin: payouts ----------

export async function recordPayout(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const amount = Math.round(Number(formData.get("amount")));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than zero." };
  await db.payout.create({ data: { userId, amount, note } });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: "Payment recorded." };
}

// ---------- Transcriber ----------

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
        amount: earningsFor(job.durationSeconds),
        seconds: job.durationSeconds,
        referrerId: user.referredById,
      },
      update: {},
    }),
  ]);
  revalidatePath("/jobs");
  revalidatePath("/earnings");
  revalidatePath("/admin");
  redirect("/jobs?submitted=1");
}
