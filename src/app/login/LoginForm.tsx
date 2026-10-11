"use client";

import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { login } from "@/app/actions";
import { Spinner } from "@/components/client";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-600/10">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input h-10" id="email" name="email" type="email" required autoComplete="email" autoFocus={!state?.error} key={state?.email ?? ""} defaultValue={state?.email} placeholder="you@example.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input className="input h-10 pr-10" id="password" autoFocus={!!state?.error} name="password" type={show ? "text" : "password"} required autoComplete="current-password" />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <button className="btn h-10 w-full" disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
