import { createHmac, timingSafeEqual } from 'node:crypto';
import { PdfWriter } from '../common/pdf.js';

export const DOC_KINDS = ['transcript', 'provisional_certificate', 'grade_card'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_TITLE: Record<DocKind, string> = {
  transcript: 'ACADEMIC TRANSCRIPT',
  provisional_certificate: 'PROVISIONAL CERTIFICATE',
  grade_card: 'CONSOLIDATED GRADE CARD',
};
const SERIAL_PREFIX: Record<DocKind, string> = { transcript: 'TR', provisional_certificate: 'PC', grade_card: 'GC' };

export interface TermLine {
  code: string;
  subject: string;
  credits: number;
  percent: number | null;
  grade: string;
  gradePoint: number;
  passed: boolean;
}

export interface TermBlock {
  label: string;
  source: 'kinetix' | 'imported';
  lines: TermLine[];
  sgpa: number;
  creditsAttempted: number;
  creditsEarned: number;
  creditPoints: number;
}

export interface StudentHeader {
  institution: string;
  name: string;
  rollNo: string;
  className: string;
  program: string;
}

/** The figures a document is issued with; stored on the request so a re-download never changes. */
export interface DocSnapshot {
  header: StudentHeader;
  terms: TermBlock[];
  cgpa: number;
  creditsEarned: number;
  creditsAttempted: number;
  outcome: 'passed' | 'incomplete';
  classLabel: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Imported (previous system) marks of one term as a term block: SGPA is credit-weighted grade points over attempted credits. */
export function importedTerm(label: string, rows: { code: string; subject: string; credits: number; internal: number | null; external: number | null; maxInternal: number; maxExternal: number; grade: string | null; gradePoint: number | null; result: string }[]): TermBlock {
  const lines: TermLine[] = rows.map((r) => {
    const max = r.maxInternal + r.maxExternal;
    return { code: r.code, subject: r.subject, credits: r.credits, percent: max > 0 ? r2((((r.internal ?? 0) + (r.external ?? 0)) / max) * 100) : null, grade: r.grade ?? '-', gradePoint: r.gradePoint ?? 0, passed: r.result === 'pass' };
  });
  const creditsAttempted = lines.reduce((a, l) => a + l.credits, 0);
  const creditPoints = lines.reduce((a, l) => a + (l.passed ? l.credits * l.gradePoint : 0), 0);
  return { label, source: 'imported', lines, sgpa: creditsAttempted > 0 ? r2(creditPoints / creditsAttempted) : 0, creditsAttempted, creditsEarned: lines.filter((l) => l.passed).reduce((a, l) => a + l.credits, 0), creditPoints };
}

/** Overall CGPA, credits and class from every term; "incomplete" while any subject is not passed. */
export function consolidate(terms: TermBlock[], classes: { label: string; minPercent: number }[] = []): Pick<DocSnapshot, 'cgpa' | 'creditsEarned' | 'creditsAttempted' | 'outcome' | 'classLabel'> {
  const attempted = terms.reduce((a, t) => a + t.creditsAttempted, 0);
  const points = terms.reduce((a, t) => a + t.creditPoints, 0);
  const cgpa = attempted > 0 ? r2(points / attempted) : 0;
  const outcome = terms.length > 0 && terms.every((t) => t.lines.every((l) => l.passed)) ? 'passed' : 'incomplete';
  // CGPA on a 10 point scale read as a percentage for the class bands (the common 10 x CGPA convention).
  const classLabel = outcome === 'passed' ? (classes.find((c) => cgpa * 10 >= c.minPercent)?.label ?? '') : '';
  return { cgpa, creditsEarned: terms.reduce((a, t) => a + t.creditsEarned, 0), creditsAttempted: attempted, outcome, classLabel };
}

export const DEFAULT_CLASSES = [
  { label: 'First Class with Distinction', minPercent: 75 },
  { label: 'First Class', minPercent: 60 },
  { label: 'Second Class', minPercent: 50 },
  { label: 'Pass Class', minPercent: 40 },
];

export const serialFor = (kind: DocKind, year: number, seq: number) => `${SERIAL_PREFIX[kind]}/${year}/${String(seq).padStart(4, '0')}`;

const mac = (secret: string, tenantId: string, serial: string) => createHmac('sha256', secret).update(`academicdoc:${tenantId}:${serial}`).digest('base64url').slice(0, 16);

/** The signed code on the QR: the serial (slashes written as dashes) and an HMAC of the tenant and serial. */
export const docCode = (secret: string, tenantId: string, serial: string) => `${serial.replace(/\//g, '-')}.${mac(secret, tenantId, serial)}`;

/** The serial of a code, or null when it is malformed or the mac does not match. */
export function parseDocCode(secret: string, tenantId: string, code: string): string | null {
  const m = /^([A-Z]{2}-\d{4}-\d{4})\.([A-Za-z0-9_-]{16})$/.exec(code);
  if (!m) return null;
  const serial = m[1]!.replace(/-/g, '/');
  const expected = Buffer.from(mac(secret, tenantId, serial));
  const given = Buffer.from(m[2]!);
  return given.length === expected.length && timingSafeEqual(given, expected) ? serial : null;
}

const header = (pdf: PdfWriter, h: StudentHeader, title: string, serial: string, issuedOn: string) => {
  pdf.text(h.institution, { size: 16, bold: true, align: 'center' });
  pdf.text(title, { size: 12, bold: true, align: 'center' });
  pdf.text(`Serial no: ${serial}    Date of issue: ${issuedOn}`, { size: 9, align: 'center' });
  pdf.rule();
  pdf.text(`Name: ${h.name}`, { bold: true });
  pdf.text(`Roll no: ${h.rollNo}      Class: ${h.className}      Programme: ${h.program}`);
  pdf.gap(4);
  pdf.rule();
};

const footer = (pdf: PdfWriter, verifyUrl: string) => {
  pdf.gap(10);
  pdf.qr(verifyUrl, 80);
  pdf.text('Scan the code to check that this document is genuine.', { size: 9, stay: true });
  pdf.gap(88);
  pdf.text('Controller of Examinations', { align: 'right' });
};

const termRows = (pdf: PdfWriter, t: TermBlock) => {
  const xs = [0, 70, 270, 320, 370, 420, 470];
  pdf.row(['Code', 'Subject', 'Credits', 'Marks %', 'Grade', 'Points', 'Result'], xs, { bold: true });
  pdf.rule();
  for (const l of t.lines) pdf.row([l.code, l.subject, String(l.credits), l.percent === null ? '-' : l.percent.toFixed(2), l.grade, l.gradePoint.toFixed(2), l.passed ? 'Pass' : 'Fail'], xs);
  pdf.rule();
};

/** The issued document as a PDF with a signed QR to the public verification page. */
export function docPdf(kind: DocKind, s: DocSnapshot, serial: string, issuedOn: string, verifyUrl: string): Buffer {
  const pdf = new PdfWriter();
  header(pdf, s.header, DOC_TITLE[kind], serial, issuedOn);
  if (kind === 'transcript') {
    for (const t of s.terms) {
      pdf.gap(6);
      pdf.text(t.label, { bold: true });
      termRows(pdf, t);
      pdf.text(`SGPA ${t.sgpa.toFixed(2)}    Credits earned ${t.creditsEarned}/${t.creditsAttempted}`);
    }
    pdf.gap(10);
    pdf.text(`Cumulative CGPA: ${s.cgpa.toFixed(2)}    Credits earned: ${s.creditsEarned}/${s.creditsAttempted}`, { bold: true, size: 12 });
  } else if (kind === 'grade_card') {
    const xs = [0, 250, 330, 410];
    pdf.row(['Semester', 'SGPA', 'Credits earned', 'Credits attempted'], xs, { bold: true });
    pdf.rule();
    for (const t of s.terms) pdf.row([t.label, t.sgpa.toFixed(2), String(t.creditsEarned), String(t.creditsAttempted)], xs);
    pdf.rule();
    pdf.text(`CGPA: ${s.cgpa.toFixed(2)}    Credits earned: ${s.creditsEarned}/${s.creditsAttempted}`, { bold: true, size: 12 });
    pdf.text(`Result: ${s.outcome === 'passed' ? `PASSED${s.classLabel ? ` - ${s.classLabel}` : ''}` : 'NOT YET COMPLETE'}`, { bold: true });
  } else {
    pdf.gap(10);
    pdf.paragraph(
      `This is to certify that ${s.header.name} (roll no ${s.header.rollNo}) has ${s.outcome === 'passed' ? 'successfully completed' : 'appeared in the examinations of'} the ${s.header.program} programme of this institution, with a cumulative grade point average of ${s.cgpa.toFixed(2)} and ${s.creditsEarned} credits earned${s.outcome === 'passed' && s.classLabel ? `, placed in ${s.classLabel}` : ''}.`,
      { size: 11 },
    );
    pdf.gap(8);
    pdf.paragraph('This certificate is provisional. It is issued on the request of the student until the degree certificate is awarded by the university, and is valid for that purpose only.', { size: 10 });
  }
  footer(pdf, verifyUrl);
  return pdf.build();
}
