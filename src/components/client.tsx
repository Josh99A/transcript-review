"use client";

import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { FormState } from "@/app/actions";

type Action = (formData: FormData) => Promise<FormState | void>;

/** Shows the action's result as a toast. Redirects thrown by the action pass through. */
function report(res: FormState | void, success?: string) {
  if (res?.error) toast.error(res.error);
  else if (res?.ok || success) toast.success(res?.ok ?? success!);
}

/** A second step before a critical action. `typeWord` or `tick` make the person type a word or tick a box first. */
export type Confirm = {
  title: string;
  description?: React.ReactNode | ((data: FormData) => React.ReactNode);
  label: string;
  danger?: boolean;
  typeWord?: string;
  tick?: string;
};

function ConfirmControls({ confirm, pending, onCancel, onConfirm }: { confirm: Confirm; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState("");
  const [ticked, setTicked] = useState(false);
  const ready = (!confirm.typeWord || typed.trim().toUpperCase() === confirm.typeWord.toUpperCase()) && (!confirm.tick || ticked);
  return (
    <div className="space-y-4">
      {confirm.typeWord && (
        <div>
          <label className="label" htmlFor="confirm-word">Type <span className="font-mono font-semibold">{confirm.typeWord}</span> to confirm</label>
          <input className="input" id="confirm-word" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" autoFocus />
        </div>
      )}
      {confirm.tick && (
        <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
          {confirm.tick}
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
        <button type="button" className={confirm.danger ? "btn-danger" : "btn"} onClick={onConfirm} disabled={pending || !ready}>
          {pending && <Spinner />}
          {confirm.label}
        </button>
      </div>
    </div>
  );
}

/** A form that runs a server action and reports the result as a toast, optionally after a confirmation step. */
export function ActionForm({
  action,
  success,
  className,
  children,
  onDone,
  confirm,
  resetOnSuccess,
  redirectTo,
}: {
  action: Action;
  success?: string;
  className?: string;
  children: React.ReactNode;
  onDone?: () => void;
  confirm?: Confirm;
  /** Clear the fields once it works, e.g. after sending a message. */
  resetOnSuccess?: boolean;
  /** Go here once it works. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const run = (data: FormData) =>
    start(async () => {
      const res = await action(data);
      report(res, success);
      setAsking(null);
      if (res?.error) return;
      if (resetOnSuccess) formRef.current?.reset();
      onDone?.();
      if (redirectTo) router.push(redirectTo);
    });
  const cancel = () => {
    if (pending) return;
    setAsking(null);
    // Put any changed picker back to what was saved.
    formRef.current?.reset();
  };
  const description = asking && typeof confirm?.description === "function" ? confirm.description(asking) : (confirm?.description as React.ReactNode);
  return (
    <>
      <form
        ref={formRef}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (confirm) setAsking(data);
          else run(data);
        }}
      >
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </form>
      {confirm && (
        <Modal open={!!asking} onClose={cancel} title={confirm.title} description={description}>
          <ConfirmControls key={asking ? "open" : "closed"} confirm={confirm} pending={pending} onCancel={cancel} onConfirm={() => asking && run(asking)} />
        </Modal>
      )}
    </>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden />;
}

/** Accessible modal built on the native <dialog> element. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
            </div>
            <button type="button" onClick={onClose} className="btn-ghost -mt-1 -mr-2 size-8 px-0" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/**
 * A button that asks for confirmation in a modal, then runs a server action with the given hidden fields.
 * Replaces window.confirm so destructive steps are explained and easy to back out of.
 */
export function ConfirmAction({
  action,
  fields,
  trigger,
  triggerClassName = "btn-secondary",
  title,
  description,
  confirmLabel,
  danger,
  success,
  typeWord,
  tick,
}: {
  action: Action;
  fields: Record<string, string>;
  trigger: React.ReactNode;
  triggerClassName?: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  success?: string;
  typeWord?: string;
  tick?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={() => !pending && setOpen(false)} title={title} description={description}>
        <ConfirmControls
          key={open ? "open" : "closed"}
          confirm={{ title, label: confirmLabel, danger, typeWord, tick }}
          pending={pending}
          onCancel={() => setOpen(false)}
          onConfirm={() =>
            start(async () => {
              const data = new FormData();
              for (const [k, v] of Object.entries(fields)) data.set(k, v);
              const res = await action(data);
              report(res, success);
              if (!res?.error) setOpen(false);
            })
          }
        />
      </Modal>
    </>
  );
}

/** Opens and scrolls to a collapsed section when the link points at it, e.g. a notification to #issue-…. */
export function OpenLinkedDetails() {
  useEffect(() => {
    const open = () => {
      const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
