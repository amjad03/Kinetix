import { A4, Pdf } from '../common/pdf-doc.js';

const money = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const L = 60;
const W = A4.w - 120;

function letterhead(pdf: Pdf, institution: string, title: string, refNo: string, date: string) {
  pdf.text(institution, A4.w / 2, 70, { size: 17, bold: true, align: 'center' });
  pdf.line(L, 84, A4.w - L, 84, { width: 1 });
  pdf.text(title, A4.w / 2, 112, { size: 13, bold: true, align: 'center' });
  pdf.text(`Ref: ${refNo}`, L, 146, { size: 10 }).text(`Date: ${longDate(date)}`, A4.w - L, 146, { size: 10, align: 'right' });
}

export interface OfferLetterData {
  institution: string;
  offerNo: string;
  issuedOn: string;
  candidateName: string;
  position: string;
  department: string | null;
  annualCtcPaise: number;
  joiningOn: string;
  validUntil: string;
  terms: string;
}

/** The offer of appointment sent to a selected candidate. */
export function offerLetterPdf(o: OfferLetterData): Buffer {
  const pdf = new Pdf(`Offer ${o.offerNo}`).addPage();
  letterhead(pdf, o.institution, 'OFFER OF APPOINTMENT', o.offerNo, o.issuedOn);
  let y = 180;
  pdf.text(`Dear ${o.candidateName},`, L, y, { size: 11 });
  y = pdf.paragraph(
    `We are pleased to offer you the position of ${o.position}${o.department ? ` in the ${o.department} department` : ''} at ${o.institution}, following your interview and selection.`,
    L, y + 24, W, { size: 11, leading: 16 },
  );
  y = pdf.paragraph(`Your annual cost to company will be Rs. ${money(o.annualCtcPaise)}. Your salary will be paid monthly, with statutory deductions as applicable. You are asked to join on ${longDate(o.joiningOn)}.`, L, y + 8, W, { size: 11, leading: 16 });
  y = pdf.paragraph(`This offer is valid until ${longDate(o.validUntil)}. Please sign and return a copy of this letter to confirm your acceptance by then.`, L, y + 8, W, { size: 11, leading: 16 });
  if (o.terms.trim()) {
    pdf.text('Terms and conditions', L, y + 22, { size: 11, bold: true });
    y = pdf.paragraph(o.terms, L, y + 40, W, { size: 10, leading: 14 });
  }
  pdf.text('We look forward to welcoming you.', L, y + 24, { size: 11 });
  pdf.text('Authorised signatory', L, y + 90, { size: 10, bold: true }).text(o.institution, L, y + 104, { size: 10 });
  pdf.line(A4.w - L - 180, y + 76, A4.w - L, y + 76).text('Candidate signature and date', A4.w - L - 180, y + 90, { size: 9, color: '#666666' });
  return pdf.build();
}

export interface RelievingLetterData {
  institution: string;
  employeeName: string;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  joinedOn: string | null;
  lastWorkingDay: string;
  relievedOn: string;
  referenceNo: string;
}

/** Confirms that the employee has resigned, served the notice, cleared every department and been relieved. */
export function relievingLetterPdf(r: RelievingLetterData): Buffer {
  const pdf = new Pdf(`Relieving letter ${r.employeeName}`).addPage();
  letterhead(pdf, r.institution, 'RELIEVING LETTER', r.referenceNo, r.relievedOn);
  let y = 180;
  pdf.text('To whom it may concern', L, y, { size: 11, bold: true });
  const who = `${r.employeeName}${r.employeeCode ? ` (employee code ${r.employeeCode})` : ''}`;
  const role = `${r.designation ?? 'a member of staff'}${r.department ? ` in the ${r.department} department` : ''}`;
  y = pdf.paragraph(
    `This is to certify that ${who} served ${r.institution} as ${role}${r.joinedOn ? ` from ${longDate(r.joinedOn)}` : ''} until ${longDate(r.lastWorkingDay)}.`,
    L, y + 24, W, { size: 11, leading: 16 },
  );
  y = pdf.paragraph(`Their resignation has been accepted and they were relieved of their duties with effect from the close of ${longDate(r.lastWorkingDay)}. They have completed the notice period, returned all institutional property and cleared every department, and their full and final settlement has been prepared.`, L, y + 8, W, { size: 11, leading: 16 });
  y = pdf.paragraph('We thank them for their service and wish them well in their future work.', L, y + 8, W, { size: 11, leading: 16 });
  pdf.text('Authorised signatory', L, y + 80, { size: 10, bold: true }).text(r.institution, L, y + 94, { size: 10 });
  return pdf.build();
}
