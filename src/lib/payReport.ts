import { db } from "./db";
import { APPROVED, balancesByUser } from "./earnings";
import { formatHours, formatPayDate } from "./format";
import { getNextPayDate } from "./settings";

export type ReportLine = { label: string; detail: string; amount: number };

export type ReportPerson = {
  name: string;
  email: string;
  role: "USER" | "REFERRER";
  payNetwork: string | null;
  payPhone: string | null;
  payName: string | null;
  owed: number;
  /** What makes up the amount owed: unpaid approved jobs, referral pay, and any rounding on total hours. */
  lines: ReportLine[];
};

export type PaymentReport = {
  generatedAt: Date;
  payDate: string | null;
  people: ReportPerson[];
  total: number;
  /** Submitted work not approved yet: not in the totals, shown so the admin knows more is coming. */
  awaiting: number;
};

/** Dates in the report are shown in Kampala time, wherever the server runs. */
export function reportDate(d: Date, withTime = false): string {
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Africa/Kampala" });
}

/**
 * Everyone owed money right now, with their payment details and what they're owed for, so an admin
 * can pay without being online. Payments aren't tied to jobs, so they're counted against approved
 * jobs oldest first (as on the earnings pages), then against referral pay.
 */
export async function paymentReport(): Promise<PaymentReport> {
  const [balances, users, earnings, payDate] = await Promise.all([
    balancesByUser(),
    db.user.findMany({ where: { role: { in: ["USER", "REFERRER"] } }, orderBy: { name: "asc" } }),
    db.earning.findMany({
      where: APPROVED,
      orderBy: { createdAt: "asc" },
      select: { userId: true, amount: true, seconds: true, job: { select: { title: true, project: true, approvedAt: true, fixedPay: true } } },
    }),
    getNextPayDate(),
  ]);

  const people: ReportPerson[] = [];
  let awaiting = 0;
  for (const u of users) {
    const b = balances.get(u.id);
    if (!b) continue;
    awaiting += b.awaiting;
    if (b.owed <= 0) continue;
    let cover = b.paid;
    const lines: ReportLine[] = [];
    for (const e of earnings) {
      if (e.userId !== u.id) continue;
      const due = e.amount - Math.min(cover, e.amount);
      cover = Math.max(0, cover - e.amount);
      if (due <= 0) continue;
      const job = e.job;
      const parts = [job.project, job.approvedAt && `approved ${reportDate(job.approvedAt)}`, job.fixedPay != null ? "fixed price" : formatHours(e.seconds), due < e.amount && "part paid"];
      lines.push({ label: job.title, detail: parts.filter(Boolean).join(" · "), amount: due });
    }
    const referralDue = b.referralPay - Math.min(cover, b.referralPay);
    if (referralDue > 0) lines.push({ label: "Referral pay", detail: "From work by people they referred", amount: referralDue });
    // Hourly pay is worked out on total time, so it can differ from the sum of the jobs by a few shillings.
    const rounding = b.owed - lines.reduce((s, l) => s + l.amount, 0);
    if (rounding !== 0) lines.push({ label: "Rounding on total hours", detail: "", amount: rounding });
    people.push({ name: u.name, email: u.email, role: u.role as "USER" | "REFERRER", payNetwork: u.payNetwork, payPhone: u.payPhone, payName: u.payName, owed: b.owed, lines });
  }
  people.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  return { generatedAt: new Date(), payDate, people, total: people.reduce((s, p) => s + p.owed, 0), awaiting };
}

/** File name stem, e.g. "payment-report-2026-10-22". */
export function reportFileName(r: PaymentReport): string {
  return `payment-report-${r.generatedAt.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" })}`;
}

const ugx = (n: number) => n.toLocaleString("en-US");

/** A phone number spreadsheets keep as text: Ugandan numbers in local form (0772 123 456), others with 00. */
function csvPhone(phone: string | null): string {
  if (!phone) return "";
  const ug = phone.match(/^\+256 (\d{3}) (\d{3}) (\d{3})$/);
  if (ug) return `0${ug[1]} ${ug[2]} ${ug[3]}`;
  return phone.replace(/^\+/, "00");
}

/** Quotes a CSV cell, and stops spreadsheets reading people's text as a formula. */
function cell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(r: PaymentReport): string {
  const header = ["Name", "Role", "Network", "Phone", "Name on account", "Amount owed (UGX)", "Paid (tick)", "Owed for", "Email"];
  const rows = r.people.map((p) => [
    p.name,
    p.role === "REFERRER" ? "Referrer" : "Transcriber",
    p.payNetwork ?? "",
    p.payPhone ? csvPhone(p.payPhone) : "NO PAYMENT NUMBER",
    p.payName ?? "",
    p.owed,
    "",
    p.lines.map((l) => `${l.label}: UGX ${ugx(l.amount)}`).join("; "),
    p.email,
  ]);
  rows.push(["Total", "", "", "", "", r.total, "", `${r.people.length} ${r.people.length === 1 ? "person" : "people"}`, ""]);
  // The byte order mark makes Excel open the file as UTF-8, so names keep their accents.
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function reportPdf(r: PaymentReport): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const brand: [number, number, number] = [79, 70, 229];
  const slate: [number, number, number] = [100, 116, 139];
  const dark: [number, number, number] = [15, 23, 42];
  const missing = r.people.filter((p) => !p.payPhone).length;

  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...dark).text("Payment report", margin, 52);
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...slate);
  doc.text(`Made ${reportDate(r.generatedAt, true)} (Kampala time)${r.payDate ? `  ·  Pay date ${formatPayDate(r.payDate)}` : ""}`, margin, 68);

  // Summary boxes.
  const boxes = [
    ["To pay", `UGX ${ugx(r.total)}`],
    ["People", String(r.people.length)],
    ["No payment number", String(missing)],
  ];
  const gap = 10;
  const boxW = (pageWidth - margin * 2 - gap * 2) / 3;
  boxes.forEach(([label, value], i) => {
    const x = margin + i * (boxW + gap);
    doc.setDrawColor(226, 232, 240).setFillColor(248, 250, 252).roundedRect(x, 82, boxW, 46, 4, 4, "FD");
    doc.setFontSize(8.5).setTextColor(...slate).text(label, x + 10, 98);
    const warn = i === 2 && missing > 0;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...(warn ? ([180, 83, 9] as [number, number, number]) : dark)).text(value, x + 10, 118);
    doc.setFont("helvetica", "normal");
  });

  let y = 146;
  doc.setFontSize(8.5).setTextColor(...slate);
  const note = doc.splitTextToSize(
    `Amounts are approved work not yet recorded as paid.${r.awaiting > 0 ? ` UGX ${ugx(r.awaiting)} more is submitted and waiting for review, and isn't included.` : ""} Once you're back online, record each payment on Team & payments so balances stay right.`,
    pageWidth - margin * 2,
  );
  doc.text(note, margin, y);
  y += note.length * 11 + 8;

  if (r.people.length === 0) {
    doc.setFontSize(12).setTextColor(...dark).text("Nobody is owed anything right now.", margin, y + 16);
    return doc.output("arraybuffer");
  }

  const tick = "      ";
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Name", "Network", "Phone", "Name on account", "Amount (UGX)", "Paid"]],
    body: r.people.map((p, i) => [String(i + 1), p.name, p.payNetwork ?? "", p.payPhone ?? "No payment number", p.payName ?? "", ugx(p.owed), tick]),
    foot: [["", "Total", "", "", "", ugx(r.total), ""]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: dark, valign: "middle" },
    headStyles: { fillColor: brand, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: dark, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 22, textColor: slate }, 3: { cellWidth: 98 }, 5: { halign: "right", cellWidth: 78 }, 6: { cellWidth: 34, halign: "center" } },
    didParseCell: (c) => {
      if (c.section === "body" && c.column.index === 3 && !r.people[c.row.index].payPhone) c.cell.styles.textColor = [180, 83, 9];
      if (c.column.index === 5 && c.section !== "body") c.cell.styles.halign = "right";
    },
    // An empty box to tick by hand once each person is paid.
    didDrawCell: (c) => {
      if (c.section !== "body" || c.column.index !== 6) return;
      const s = 10;
      doc.setDrawColor(100, 116, 139).setLineWidth(0.8).rect(c.cell.x + (c.cell.width - s) / 2, c.cell.y + (c.cell.height - s) / 2, s, s);
    },
  });

  // What each person is owed for.
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...dark).text("What each person is owed for", margin, 52);
  y = 66;
  for (const p of r.people) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: 50 },
      head: [
        [{ content: `${p.name}${p.role === "REFERRER" ? " (referrer)" : ""}`, colSpan: 2, styles: { fontSize: 10.5 } }, { content: `UGX ${ugx(p.owed)}`, styles: { halign: "right", fontSize: 10.5 } }],
        [{ content: p.payPhone ? [p.payPhone, p.payNetwork, p.payName].filter(Boolean).join("  ·  ") : "No payment number yet", colSpan: 3, styles: { fontStyle: "normal", textColor: p.payPhone ? slate : [180, 83, 9], fontSize: 8.5, cellPadding: { top: 0, bottom: 6, left: 5, right: 5 } } }],
      ],
      body: p.lines.map((l) => [l.label, l.detail, ugx(l.amount)]),
      showHead: "firstPage",
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: dark },
      headStyles: { fillColor: [241, 245, 249], textColor: dark, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 210 }, 1: { textColor: slate, fontSize: 8.5 }, 2: { halign: "right", cellWidth: 80 } },
      didDrawCell: (c) => {
        if (c.section === "body" && c.column.index === 0) doc.setDrawColor(241, 245, 249).setLineWidth(0.5).line(margin, c.cell.y + c.cell.height, pageWidth - margin, c.cell.y + c.cell.height);
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...slate);
    doc.text(`Payment report · ${reportDate(r.generatedAt, true)}`, margin, doc.internal.pageSize.getHeight() - 24);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 24, { align: "right" });
  }
  return doc.output("arraybuffer");
}
