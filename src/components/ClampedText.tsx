import { richHtml } from "@/lib/richtext";
import ClampedHtml from "./ClampedHtml";

/** Admin-written instructions cut to a few lines with "…", with a button to read the rest. */
export default function ClampedText({ html, lines = 3, className = "" }: { html: string | null | undefined; lines?: 2 | 3 | 4 | 6; className?: string }) {
  return <ClampedHtml html={richHtml(html)} lines={lines} className={className} />;
}
