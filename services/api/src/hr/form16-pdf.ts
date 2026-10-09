import { PdfWriter } from '../common/pdf.js';

export interface Form16Data {
  fy: string;
  deductor: { name: string; address: string; tan: string; pan: string; responsible: string; designation: string };
  employee: { name: string; code: string | null; pan: string | null };
  months: { month: string; grossPaise: number; taxablePaise: number; ptPaise: number; pfPaise: number; tdsPaise: number }[];
  challans: { month: string; bsr: string; serial: string; depositedOn: string; tdsPaise: number }[];
  quarters: { quarter: string; deductedPaise: number; depositedPaise: number }[];
}

const inr = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The employer's statement of salary and tax deducted for a financial year (the figures behind Form 16 Part B, with the challans for Part A). */
export function form16Pdf(d: Form16Data): Buffer {
  const pdf = new PdfWriter();
  pdf.text('FORM 16: statement of salary paid and tax deducted at source', { size: 13, bold: true, align: 'center' });
  pdf.text(`Section 203 of the Income-tax Act | Financial year ${d.fy}`, { size: 10, align: 'center' });
  pdf.rule();
  pdf.text(`Employer: ${d.deductor.name}`, { bold: true });
  if (d.deductor.address) pdf.text(d.deductor.address);
  pdf.text(`TAN: ${d.deductor.tan}      PAN: ${d.deductor.pan}`);
  pdf.gap(4);
  pdf.text(`Employee: ${d.employee.name}`, { bold: true });
  pdf.text(`Employee code: ${d.employee.code ?? '-'}      PAN: ${d.employee.pan ?? 'Not recorded'}`);
  pdf.rule();

  pdf.text('Part A: tax deducted and deposited, by quarter', { bold: true });
  const qx = [0, 120, 280, 400];
  pdf.row(['Quarter', 'Deducted (INR)', 'Deposited (INR)', 'Difference'], qx, { bold: true });
  for (const q of d.quarters) pdf.row([q.quarter, inr(q.deductedPaise), inr(q.depositedPaise), inr(q.deductedPaise - q.depositedPaise)], qx);
  pdf.gap(4);
  pdf.text('Challans', { bold: true });
  const cx = [0, 70, 150, 260, 380];
  pdf.row(['Month', 'BSR code', 'Serial no.', 'Deposited on', 'Amount (INR)'], cx, { bold: true });
  for (const c of d.challans) pdf.row([c.month, c.bsr, c.serial, c.depositedOn, inr(c.tdsPaise)], cx);
  if (d.challans.length === 0) pdf.text('No challan has been recorded for this year.');
  pdf.rule();

  pdf.text('Part B: salary and tax, month by month', { bold: true });
  const mx = [0, 60, 150, 240, 320, 400, 460];
  pdf.row(['Month', 'Gross (INR)', 'Taxable (INR)', 'Prof. tax', 'PF', 'TDS'], mx, { bold: true });
  const sum = { grossPaise: 0, taxablePaise: 0, ptPaise: 0, pfPaise: 0, tdsPaise: 0 };
  for (const m of d.months) {
    pdf.row([m.month, inr(m.grossPaise), inr(m.taxablePaise), inr(m.ptPaise), inr(m.pfPaise), inr(m.tdsPaise)], mx);
    sum.grossPaise += m.grossPaise;
    sum.taxablePaise += m.taxablePaise;
    sum.ptPaise += m.ptPaise;
    sum.pfPaise += m.pfPaise;
    sum.tdsPaise += m.tdsPaise;
  }
  pdf.rule();
  pdf.row(['Total', inr(sum.grossPaise), inr(sum.taxablePaise), inr(sum.ptPaise), inr(sum.pfPaise), inr(sum.tdsPaise)], mx, { bold: true });
  pdf.gap(14);
  pdf.paragraph('This statement is computed from locked payroll runs. The TDS certificate with its certificate number is issued from TRACES; use this statement to check it before it is shared with the employee.', { size: 8 });
  pdf.gap(16);
  pdf.text(`${d.deductor.responsible}${d.deductor.designation ? ', ' + d.deductor.designation : ''}`, { align: 'right' });
  pdf.text('Person responsible for deduction of tax', { size: 8, align: 'right' });
  return pdf.build();
}
