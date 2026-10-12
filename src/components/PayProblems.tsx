import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { PayProblem } from "@/lib/payCheck";

/** Warns admins about pay that doesn't match its job, with a link to fix each one. */
export default function PayProblems({ problems }: { problems: PayProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <section role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-600/20 sm:p-5">
      <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4 shrink-0" /> {problems.length === 1 ? "1 pay problem needs fixing" : `${problems.length} pay problems need fixing`}</p>
      <p className="mt-1 text-red-800">Payments to the people below are paused until these are fixed. Open the job to correct or remove the pay.</p>
      <ul className="mt-3 space-y-2">
        {problems.map((p, i) => (
          <li key={`${p.jobId}-${i}`} className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-red-600/10">
            <Link href={`/admin/jobs/${p.jobId}`} className="font-medium text-red-900 underline">{p.jobTitle}</Link>
            <span className="text-red-800"> · {p.userName}</span>
            <p className="text-red-800">{p.problem}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
