import { A4, Pdf } from '../common/pdf-doc.js';
import { L, letterhead, longDate, W } from './letters-pdf.js';

export interface ProbationLetterData {
  institution: string;
  employeeName: string;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  joinedOn: string | null;
  outcome: 'confirmed' | 'extended';
  decidedOn: string;
  /** For a confirmation, the date it takes effect; for an extension, the new end of probation. */
  effectiveOn: string;
  remarks: string | null;
  referenceNo: string;
}

/** Tells the employee that their probation is confirmed, or extended to a new date. */
export function probationLetterPdf(r: ProbationLetterData): Buffer {
  const confirmed = r.outcome === 'confirmed';
  const pdf = new Pdf(`Probation ${r.employeeName}`).addPage();
  letterhead(pdf, r.institution, confirmed ? 'CONFIRMATION OF SERVICE' : 'EXTENSION OF PROBATION', r.referenceNo, r.decidedOn);
  let y = 180;
  pdf.text(`Dear ${r.employeeName},`, L, y, { size: 11 });
  const who = r.employeeCode ? ` (employee code ${r.employeeCode})` : '';
  const role = `${r.designation ?? 'a member of staff'}${r.department ? ` in the ${r.department} department` : ''}`;
  y = pdf.paragraph(
    confirmed
      ? `We are pleased to confirm you${who} as a permanent member of staff of ${r.institution}, working as ${role}, with effect from ${longDate(r.effectiveOn)}${r.joinedOn ? `. You joined us on ${longDate(r.joinedOn)}` : ''}.`
      : `After a review of your work as ${role}${who}, your probation at ${r.institution} is extended until ${longDate(r.effectiveOn)}. Your progress will be reviewed again before that date.`,
    L, y + 24, W, { size: 11, leading: 16 },
  );
  if (r.remarks?.trim()) y = pdf.paragraph(`Remarks: ${r.remarks.trim()}`, L, y + 8, W, { size: 11, leading: 16 });
  y = pdf.paragraph(confirmed ? 'All other terms of your appointment remain the same. We thank you for your work and look forward to your continued contribution.' : 'All other terms of your appointment remain the same.', L, y + 8, W, { size: 11, leading: 16 });
  pdf.text('Principal', L, y + 80, { size: 10, bold: true }).text(r.institution, L, y + 94, { size: 10 });
  void A4;
  return pdf.build();
}
