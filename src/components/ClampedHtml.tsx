"use client";

import { useLayoutEffect, useRef, useState } from "react";

const CLAMP: Record<number, string> = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 6: "line-clamp-6" };

/** Sanitized rich text cut to a few lines with "…", and a button to read the rest when it's longer. */
export default function ClampedHtml({ html, lines = 3, className = "" }: { html: string; lines?: 2 | 3 | 4 | 6; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [html, open]);
  return (
    <div className={className}>
      <div ref={ref} className={`rich ${open ? "" : CLAMP[lines]}`} dangerouslySetInnerHTML={{ __html: html }} />
      {(long || open) && (
        <button type="button" className="mt-1 text-sm font-medium text-brand-600 hover:text-brand-700" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
