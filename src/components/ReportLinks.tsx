import { FileDown } from "lucide-react";

/** Downloads of who is owed what, with payment numbers, for paying without a connection. */
export default function ReportLinks({ className = "", label = "Payment report (PDF)" }: { className?: string; label?: string }) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <a href="/api/reports/payments" download className="btn-secondary flex-1" title="Who to pay, their numbers and what for, as a PDF to keep or print">
        <FileDown className="size-4" /> {label}
      </a>
      <a href="/api/reports/payments?format=csv" download className="btn-secondary" title="The same list as a spreadsheet">
        CSV
      </a>
    </div>
  );
}
