import { createHmac, timingSafeEqual } from 'node:crypto';

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
  source: 'zynetix' | 'imported';
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
