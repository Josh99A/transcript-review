"use client";

import { Banknote, CalendarClock } from "lucide-react";
import { payEveryone, updatePayDate } from "@/app/actions";
import { daysUntil, formatPayDate, formatUGX } from "@/lib/format";
import { ActionForm, ConfirmAction } from "./client";

/** Admin control for the announced pay date, plus a one-click pay run for everyone owed. */
export default function PayDayCard({ payDate, totalOwed, peopleOwed }: { payDate: string | null; totalOwed: number; peopleOwed: number }) {
  const days = payDate ? daysUntil(payDate) : null;
  return (
    <section className="card">
      <div className="card-header">
        <CalendarClock className="size-4.5 text-brand-600" />
        <h2 className="card-title">Pay date</h2>
      </div>
      <div className="card-body space-y-4">
        {payDate ? (
          <div>
            <div className="text-lg font-semibold text-slate-900">{formatPayDate(payDate)}</div>
            <div className={`text-xs ${days !== null && days < 0 ? "text-amber-700" : "text-slate-500"}`}>
              {days === null ? "" : days > 1 ? `In ${days} days` : days === 1 ? "Tomorrow" : days === 0 ? "Today" : "Passed. Pay everyone, then set the next date."}
              {" · "}shown to every transcriber and referrer
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No pay date set. Transcribers and referrers will see it once you set one.</p>
        )}

        <ActionForm action={updatePayDate} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="payDate">{payDate ? "Change date" : "Set date"}</label>
            <input className="input" id="payDate" name="payDate" type="date" defaultValue={payDate ?? ""} key={payDate ?? ""} required />
          </div>
          <button className="btn-secondary">Save</button>
        </ActionForm>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-600">Due {payDate ? "on that date" : "now"}</span>
            <span className="num text-lg font-semibold text-slate-900">{formatUGX(totalOwed)}</span>
          </div>
          <div className="text-xs text-slate-500">{peopleOwed} {peopleOwed === 1 ? "person" : "people"}</div>
          <ConfirmAction
            action={payEveryone}
            fields={{}}
            trigger={<><Banknote className="size-4" /> Pay everyone owed</>}
            triggerClassName="btn mt-3 w-full"
            title="Record payment for everyone?"
            description={`This records ${formatUGX(totalOwed)} paid to ${peopleOwed} ${peopleOwed === 1 ? "person" : "people"}, bringing everyone's balance to zero. Only do this once you've actually sent the money.`}
            confirmLabel="Record payments"
            tick="I've actually sent this money to everyone listed."
          />
        </div>
      </div>
    </section>
  );
}
