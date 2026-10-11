"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Confirms a submission once, then clears the flag from the URL so a refresh doesn't repeat it. */
export default function SubmittedToast() {
  const router = useRouter();
  useEffect(() => {
    toast.success("Transcript submitted", { description: "Your pay has been added to your earnings.", id: "submitted" });
    router.replace("/jobs", { scroll: false });
  }, [router]);
  return null;
}
