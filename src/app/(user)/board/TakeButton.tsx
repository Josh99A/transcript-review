"use client";

import { Hand } from "lucide-react";
import { claimJob } from "@/app/actions";
import { ActionForm } from "@/components/client";

/** Take a job from the board. The first transcriber to take it gets it. */
export default function TakeButton({ jobId, title }: { jobId: string; title: string }) {
  return (
    <ActionForm
      action={claimJob}
      redirectTo={`/jobs/${jobId}`}
      confirm={{ title: `Take “${title}”?`, description: "It's yours straight away and moves into My jobs. Only take it if you can finish it in time.", label: "Take this job" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <button className="btn w-full sm:w-auto"><Hand className="size-4" /> Take this job</button>
    </ActionForm>
  );
}
