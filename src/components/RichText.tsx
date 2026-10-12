import { richHtml } from "@/lib/richtext";

/** Shows admin-written instructions with their formatting. */
export default function RichText({ html, className = "" }: { html: string | null | undefined; className?: string }) {
  return <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: richHtml(html) }} />;
}
