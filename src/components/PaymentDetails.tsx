"use client";

import { Pencil, Smartphone, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { savePaymentDetails } from "@/app/actions";
import { PAY_NETWORKS } from "@/lib/payment";
import { ActionForm } from "./client";

type Details = { payNetwork: string | null; payPhone: string | null; payName: string | null };

/** Card where transcribers and referrers say which number their payments should go to. */
export default function PaymentDetails({ details }: { details: Details }) {
  const [editing, setEditing] = useState(!details.payPhone);
  return (
    <section className={`card ${details.payPhone ? "" : "border-amber-300"}`}>
      <div className="card-header">
        <Smartphone className="size-4.5 text-brand-600" />
        <h2 className="card-title">Where to pay you</h2>
        {details.payPhone && !editing && (
          <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Change</button>
        )}
      </div>
      <div className="card-body">
        {!editing && details.payPhone ? (
          <div>
            <div className="num text-lg font-semibold text-slate-900">{details.payPhone}</div>
            <div className="text-sm text-slate-500">{details.payNetwork}{details.payName ? ` · ${details.payName}` : ""}</div>
          </div>
        ) : (
          <ActionForm action={savePaymentDetails} onDone={() => setEditing(false)} className="space-y-3">
            {!details.payPhone && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Add the number you want to be paid on so the admin can send your money.
              </p>
            )}
            <div>
              <label className="label" htmlFor="payNetwork">Pay me by</label>
              <select className="input" id="payNetwork" name="payNetwork" defaultValue={details.payNetwork ?? PAY_NETWORKS[0]}>
                {PAY_NETWORKS.map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="payPhone">Phone number</label>
              <input className="input num" id="payPhone" name="payPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={details.payPhone ?? ""} placeholder="e.g. 0772 123 456" required />
            </div>
            <div>
              <label className="label" htmlFor="payName">Name on the account <span className="font-normal text-slate-400">(optional)</span></label>
              <input className="input" id="payName" name="payName" defaultValue={details.payName ?? ""} placeholder="If it's different from yours" />
            </div>
            <div className="flex justify-end gap-2">
              {details.payPhone && <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>}
              <button className="btn">Save</button>
            </div>
          </ActionForm>
        )}
      </div>
    </section>
  );
}
