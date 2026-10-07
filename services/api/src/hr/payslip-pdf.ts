import type { Payslip } from '@kinetix/shared';
import { A4, Pdf } from '../common/pdf-doc.js';

const money = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** A one-page payslip. Only the payslip's own figures are printed; nothing is recomputed. */
export function payslipPdf(institution: string, s: Payslip): Buffer {
  const pdf = new Pdf(`Payslip ${s.month} ${s.user.fullName}`).addPage();
  const L = 40;
  const R = A4.w - 40;
  pdf.text(institution, A4.w / 2, 60, { size: 16, bold: true, align: 'center' });
  pdf.text(`Payslip for ${monthLabel(s.month)}`, A4.w / 2, 82, { size: 11, align: 'center', color: '#444444' });
  pdf.line(L, 94, R, 94, { width: 1 });

  const details: [string, string][] = [
    ['Employee', s.user.fullName],
    ['Employee code', s.user.employeeCode ?? '-'],
    ['Designation', s.user.designation ?? '-'],
    ['Department', s.user.department ?? '-'],
    ['Days in month', String(s.daysInMonth)],
    ['Loss of pay days', String(s.lopDays)],
    ['Paid days', String(s.paidDays)],
    ['Tax regime', s.taxRegime === 'new' ? 'New' : 'Old'],
  ];
  details.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? L : A4.w / 2 + 10;
    const y = 118 + Math.floor(i / 2) * 18;
    pdf.text(k, x, y, { size: 9, color: '#666666' }).text(v, x + 95, y, { size: 9, bold: true });
  });

  const top = 215;
  const mid = A4.w / 2;
  pdf.rect(L, top, mid - L - 5, 20, { fill: '#eef2f7' }).rect(mid + 5, top, R - mid - 5, 20, { fill: '#eef2f7' });
  pdf.text('Earnings', L + 6, top + 14, { size: 10, bold: true }).text('Amount (Rs.)', mid - 12, top + 14, { size: 10, bold: true, align: 'right' });
  pdf.text('Deductions', mid + 11, top + 14, { size: 10, bold: true }).text('Amount (Rs.)', R - 6, top + 14, { size: 10, bold: true, align: 'right' });
  const rows = Math.max(s.earnings.length, s.deductions.length);
  for (let i = 0; i < rows; i++) {
    const y = top + 38 + i * 18;
    const e = s.earnings[i];
    const d = s.deductions[i];
    if (e) pdf.text(e.name, L + 6, y, { size: 9.5 }).text(money(e.amountPaise), mid - 12, y, { size: 9.5, align: 'right' });
    if (d) pdf.text(d.name, mid + 11, y, { size: 9.5 }).text(money(d.amountPaise), R - 6, y, { size: 9.5, align: 'right' });
  }
  const totalsY = top + 38 + rows * 18 + 6;
  pdf.line(L, totalsY - 12, R, totalsY - 12);
  pdf.text('Gross earnings', L + 6, totalsY, { size: 10, bold: true }).text(money(s.grossPaise), mid - 12, totalsY, { size: 10, bold: true, align: 'right' });
  pdf.text('Total deductions', mid + 11, totalsY, { size: 10, bold: true }).text(money(s.deductionsPaise), R - 6, totalsY, { size: 10, bold: true, align: 'right' });

  const netY = totalsY + 36;
  pdf.rect(L, netY - 16, R - L, 30, { fill: '#e8f5ee', stroke: '#9ccfb2' });
  pdf.text('Net pay', L + 10, netY + 3, { size: 12, bold: true }).text(`Rs. ${money(s.netPaise)}`, R - 10, netY + 3, { size: 12, bold: true, align: 'right' });

  const empY = netY + 44;
  pdf.text('Employer contributions (not deducted from your pay)', L, empY, { size: 9, bold: true, color: '#444444' });
  pdf.text(`EPF Rs. ${money(s.employer.epfPaise)}   EPS Rs. ${money(s.employer.epsPaise)}   ESI Rs. ${money(s.employer.esiPaise)}`, L, empY + 15, { size: 9, color: '#444444' });
  pdf.text(`Projected income tax for the year: Rs. ${money(s.annualTaxPaise)}`, L, empY + 30, { size: 9, color: '#444444' });
  pdf.text('This is a computer-generated payslip.', A4.w / 2, A4.h - 40, { size: 8, align: 'center', color: '#888888' });
  return pdf.build();
}
