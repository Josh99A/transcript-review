"use client";

import { Banknote, KeyRound, UserPlus } from "lucide-react";
import { useState } from "react";
import { createUser, recordPayout, resetPassword, setReferrer } from "@/app/actions";
import { ActionForm, Modal } from "@/components/client";
import { formatUGX } from "@/lib/format";

type Option = { id: string; name: string };

export function NewUserButton({ referrers }: { referrers: Option[] }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("USER");
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><UserPlus className="size-4" /> Add person</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a person" description="Share the email and temporary password with them so they can sign in.">
        <ActionForm action={createUser} className="space-y-4" onDone={() => setOpen(false)}>
          <div><label className="label" htmlFor="nu-name">Full name</label><input className="input" id="nu-name" name="name" required autoFocus /></div>
          <div><label className="label" htmlFor="nu-email">Email</label><input className="input" id="nu-email" name="email" type="email" required /></div>
          <div>
            <label className="label" htmlFor="nu-pass">Temporary password</label>
            <input className="input" id="nu-pass" name="password" type="text" minLength={8} required />
            <p className="hint">At least 8 characters.</p>
          </div>
          <fieldset>
            <legend className="label">Role</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {[["USER", "Transcriber", "Corrects transcripts"], ["REFERRER", "Referrer", "Earns for bringing in transcribers"], ["ADMIN", "Admin", "Uploads, assigns and pays"]].map(([v, t, d]) => (
                <label key={v} className="flex cursor-pointer flex-col rounded-lg border border-slate-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <input type="radio" name="role" value={v} checked={role === v} onChange={() => setRole(v)} className="accent-brand-600" /> {t}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">{d}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {role === "USER" && (
            <div>
              <label className="label" htmlFor="nu-ref">Referred by <span className="font-normal text-slate-400">(optional)</span></label>
              <select className="input" id="nu-ref" name="referredById" defaultValue="">
                <option value="">Nobody</option>
                {referrers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {referrers.length === 0 && <p className="hint">Add a referrer first to link them here.</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn">Add person</button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function PayoutButton({ userId, name, owed }: { userId: string; name: string; owed: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-secondary btn-sm" onClick={() => setOpen(true)} disabled={owed <= 0} title={owed <= 0 ? "Nothing owed" : undefined}>
        <Banknote className="size-3.5" /> Record payment
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Pay ${name}`} description={<>They&apos;re currently owed <strong className="num text-slate-900">{formatUGX(owed)}</strong>.</>}>
        <ActionForm action={recordPayout} className="space-y-4" onDone={() => setOpen(false)}>
          <input type="hidden" name="userId" value={userId} />
          <div>
            <label className="label" htmlFor={`amt-${userId}`}>Amount paid (UGX)</label>
            <input className="input num" id={`amt-${userId}`} name="amount" type="number" min="1" defaultValue={owed > 0 ? owed : ""} required autoFocus />
          </div>
          <div>
            <label className="label" htmlFor={`note-${userId}`}>Note <span className="font-normal text-slate-400">(optional)</span></label>
            <input className="input" id={`note-${userId}`} name="note" placeholder="e.g. Mobile money, ref 12345" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn">Record payment</button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-ghost size-8 px-0" onClick={() => setOpen(true)} aria-label={`Reset password for ${name}`} title="Reset password">
        <KeyRound className="size-4" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Reset ${name}'s password`} description="Share the new password with them.">
        <ActionForm action={resetPassword} className="space-y-4" onDone={() => setOpen(false)}>
          <input type="hidden" name="userId" value={userId} />
          <div>
            <label className="label" htmlFor={`pw-${userId}`}>New password</label>
            <input className="input" id={`pw-${userId}`} name="password" type="text" minLength={8} required autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn">Set password</button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

/** Inline picker for who referred a transcriber. Locked once the bonus is credited. */
export function ReferrerSelect({ userId, current, referrers, locked }: { userId: string; current: string | null; referrers: Option[]; locked: boolean }) {
  if (locked) {
    return <span className="text-sm text-slate-700" title="Bonus already credited">{referrers.find((r) => r.id === current)?.name ?? "—"}</span>;
  }
  return (
    <ActionForm action={setReferrer}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="referredById"
        defaultValue={current ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input h-8 w-36 text-xs"
        aria-label="Referred by"
      >
        <option value="">Nobody</option>
        {referrers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </ActionForm>
  );
}
