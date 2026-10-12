/** A formatted transcript to read. The HTML must already be cleaned (cleanDoc) on the server. */
export default function DocView({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`doc doc-scroll ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
