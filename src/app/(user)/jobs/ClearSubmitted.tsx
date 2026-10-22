"use client";

import { useEffect } from "react";

/** Drops the submitted flag from the address so a refresh doesn't show the confirmation again. */
export default function ClearSubmitted() {
  useEffect(() => {
    window.history.replaceState(window.history.state, "", "/jobs");
  }, []);
  return null;
}
