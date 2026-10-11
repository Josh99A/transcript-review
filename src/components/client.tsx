"use client";

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

/** A form that runs a server action and reports the result as a toast. */
export function ActionForm({
  action,
  success,
  className,
  children,
  onDone,
}: {
  action: Action;
  success?: string;
  className?: string;
  children: React.ReactNode;
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const res = await action(data);
          report(res, success);
          if (!res?.error) onDone?.();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
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
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Modal open={open} onClose={() => !pending && setOpen(false)} title={title} description={description}>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "btn-danger" : "btn"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const data = new FormData();
                for (const [k, v] of Object.entries(fields)) data.set(k, v);
                const res = await action(data);
                report(res, success);
                if (!res?.error) setOpen(false);
              })
            }
          >
            {pending && <Spinner />}
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}
