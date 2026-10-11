"use client";

import { useActionState, useState } from "react";
import { createUser, recordPayout, resetPassword } from "@/app/actions";

function Message({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <p className="text-xs text-red-600">{state.error}</p>;
  if (state?.ok) return <p className="text-xs text-emerald-700">{state.ok}</p>;
  return null;
}

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className="label" htmlFor="nu-name">Name</label><input className="input" id="nu-name" name="name" required /></div>
      <div><label className="label" htmlFor="nu-email">Email</label><input className="input" id="nu-email" name="email" type="email" required /></div>
      <div><label className="label" htmlFor="nu-pass">Temporary password</label><input className="input" id="nu-pass" name="password" type="text" minLength={8} required /></div>
      <div>
        <label className="label" htmlFor="nu-role">Role</label>
        <select className="input" id="nu-role" name="role" defaultValue="USER">
          <option value="USER">User (transcriber)</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <Message state={state} />
      <button className="btn" disabled={pending}>Add user</button>
    </form>
  );
}

export function PayoutForm({ userId, owed }: { userId: string; owed: number }) {
  const [state, action, pending] = useActionState(recordPayout, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input className="input w-28" name="amount" type="number" min="1" defaultValue={owed > 0 ? owed : ""} placeholder="Amount" aria-label="Amount" />
      <input className="input w-28" name="note" placeholder="Note" aria-label="Note" />
      <button className="btn-secondary" disabled={pending}>Paid</button>
      <Message state={state} />
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resetPassword, undefined);
  if (!open) return <button className="text-xs text-indigo-600 hover:underline" onClick={() => setOpen(true)}>Reset password</button>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input className="input w-32" name="password" type="text" minLength={8} placeholder="New password" aria-label="New password" required />
      <button className="btn-secondary" disabled={pending}>Set</button>
      <Message state={state} />
    </form>
  );
}
