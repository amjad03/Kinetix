import { A4, Pdf } from '../common/pdf-doc.js';

export const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const L = 60;
export const W = A4.w - 120;

export function letterhead(pdf: Pdf, institution: string, title: string, refNo: string, date: string) {
  pdf.text(institution, A4.w / 2, 70, { size: 17, bold: true, align: 'center' });
  pdf.line(L, 84, A4.w - L, 84, { width: 1 });
  pdf.text(title, A4.w / 2, 112, { size: 13, bold: true, align: 'center' });
  pdf.text(`Ref: ${refNo}`, L, 146, { size: 10 }).text(`Date: ${longDate(date)}`, A4.w - L, 146, { size: 10, align: 'right' });
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

export interface AppointmentLetterData {
  institution: string;
  referenceNo: string;
  issuedOn: string;
  name: string;
  employeeCode: string;
  position: string;
  department: string | null;
  employmentType: string;
  joiningOn: string;
  annualCtcPaise: number | null;
  terms: string;
}

const EMPLOYMENT_WORDS: Record<string, string> = { permanent: 'a permanent', contract: 'a contract', probation: 'a probationary', visiting: 'a visiting' };

/** The appointment order issued when a selected candidate joins. */
export function appointmentLetterPdf(o: AppointmentLetterData): Buffer {
  const pdf = new Pdf(`Appointment ${o.employeeCode}`).addPage();
  letterhead(pdf, o.institution, 'APPOINTMENT ORDER', o.referenceNo, o.issuedOn);
  let y = 180;
  pdf.text(`Dear ${o.name},`, L, y, { size: 11 });
  y = pdf.paragraph(
    `With reference to your acceptance of our offer, you are appointed as ${o.position}${o.department ? ` in the ${o.department} department` : ''} on ${EMPLOYMENT_WORDS[o.employmentType] ?? 'a'} basis with effect from ${longDate(o.joiningOn)}. Your employee code is ${o.employeeCode}.`,
    L, y + 24, W, { size: 11, leading: 16 },
  );
  if (o.annualCtcPaise) y = pdf.paragraph(`Your annual cost to company is Rs. ${money(o.annualCtcPaise)}, paid monthly with statutory deductions (PF, ESI, professional tax and income tax) as applicable.`, L, y + 8, W, { size: 11, leading: 16 });
  if (o.employmentType === 'probation') y = pdf.paragraph("You will be on probation for the period set by the institution's service rules. Your confirmation will follow a review of your work and conduct.", L, y + 8, W, { size: 11, leading: 16 });
  y = pdf.paragraph('You will be governed by the service rules, code of conduct and leave rules of the institution in force from time to time. Please report to the HR office on your joining date with the original certificates listed in the joining checklist.', L, y + 8, W, { size: 11, leading: 16 });
  if (o.terms.trim()) {
    pdf.text('Terms and conditions', L, y + 22, { size: 11, bold: true });
    y = pdf.paragraph(o.terms, L, y + 40, W, { size: 10, leading: 14 });
  }
  pdf.text('Authorised signatory', L, y + 80, { size: 10, bold: true }).text(o.institution, L, y + 94, { size: 10 });
  pdf.line(A4.w - L - 180, y + 66, A4.w - L, y + 66).text('Accepted: signature and date', A4.w - L - 180, y + 80, { size: 9, color: '#666666' });
  return pdf.build();
}

export interface ExperienceCertificateData {
  institution: string;
  referenceNo: string;
  issuedOn: string;
  name: string;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  joinedOn: string | null;
  lastWorkingDay: string;
  /** What they did ("taught Commerce to undergraduate classes"); optional. */
  duties: string;
}

/** Certifies the period of service, the post held and the duties, for the next employer. */
export function experienceCertificatePdf(r: ExperienceCertificateData): Buffer {
  const pdf = new Pdf(`Experience certificate ${r.name}`).addPage();
  letterhead(pdf, r.institution, 'EXPERIENCE CERTIFICATE', r.referenceNo, r.issuedOn);
  let y = 180;
  pdf.text('To whom it may concern', L, y, { size: 11, bold: true });
  const who = `${r.name}${r.employeeCode ? ` (employee code ${r.employeeCode})` : ''}`;
  y = pdf.paragraph(
    `This is to certify that ${who} worked at ${r.institution} as ${r.designation ?? 'a member of staff'}${r.department ? ` in the ${r.department} department` : ''}${r.joinedOn ? ` from ${longDate(r.joinedOn)}` : ''} to ${longDate(r.lastWorkingDay)}.`,
    L, y + 24, W, { size: 11, leading: 16 },
  );
  if (r.duties.trim()) y = pdf.paragraph(`During this period they ${r.duties.trim().replace(/\.$/, '')}.`, L, y + 8, W, { size: 11, leading: 16 });
  y = pdf.paragraph('Their conduct during the period of service was good. We wish them success in their career.', L, y + 8, W, { size: 11, leading: 16 });
  pdf.text('Authorised signatory', L, y + 80, { size: 10, bold: true }).text(r.institution, L, y + 94, { size: 10 });
  return pdf.build();
}
