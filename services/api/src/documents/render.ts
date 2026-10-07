import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CertificateKind, CertificateSubject } from '@kinetix/shared';

/**
 * Fills {{placeholders}} in a template. Unknown placeholders are left as they are, so a typo
 * shows on the preview instead of silently vanishing; a known one with no value becomes "-".
 */
export function renderTemplate(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (whole, key: string) => (key in values ? (values[key] ?? '').toString().trim() || '-' : whole));
}

/** "5 October 2026" for a YYYY-MM-DD date. */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** The signed code on an ID card's QR: "<s|t>-<uuid>.<mac>", the mac an HMAC of the tenant and id. */
export function idCardCode(secret: string, tenantId: string, kind: 'student' | 'staff', id: string): string {
  const k = kind === 'student' ? 's' : 't';
  return `${k}-${id}.${mac(secret, tenantId, k, id)}`;
}

const mac = (secret: string, tenantId: string, k: string, id: string) => createHmac('sha256', secret).update(`idcard:${tenantId}:${k}:${id}`).digest('base64url').slice(0, 16);

/** The subject of a code, or null when it is malformed or the mac does not match. */
export function parseIdCardCode(secret: string, tenantId: string, code: string): { kind: 'student' | 'staff'; id: string } | null {
  const m = /^([st])-([0-9a-f-]{36})\.([A-Za-z0-9_-]{16})$/.exec(code);
  if (!m) return null;
  const expected = Buffer.from(mac(secret, tenantId, m[1], m[2]));
  const given = Buffer.from(m[3]);
  return given.length === expected.length && timingSafeEqual(given, expected) ? { kind: m[1] === 's' ? 'student' : 'staff', id: m[2] } : null;
}

interface DefaultTemplate {
  kind: CertificateKind;
  name: string;
  subjectType: CertificateSubject;
  title: string;
  body: string;
  fields: { key: string; label: string; required: boolean }[];
  serialPrefix: string;
}

const STUDENT = 'This is to certify that {{name}} (Roll No. {{rollNo}}), ';

/** The templates created for a new institution (one per kind). Editable afterwards. */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    kind: 'transfer_certificate',
    name: 'Transfer certificate',
    subjectType: 'student',
    title: 'Transfer Certificate',
    body: `${STUDENT}was a student of {{className}} ({{program}}) at {{institution}} in the academic year {{academicYear}}.\n\nReason for leaving: {{fields.reasonForLeaving}}.\nConduct and character: {{fields.conduct}}.\nAll dues to the institution have been cleared and the student is free to join another institution.\n\nIssued on {{issuedOn}}.`,
    fields: [
      { key: 'reasonForLeaving', label: 'Reason for leaving', required: true },
      { key: 'conduct', label: 'Conduct and character', required: false },
    ],
    serialPrefix: 'TC',
  },
  {
    kind: 'bonafide',
    name: 'Bonafide certificate',
    subjectType: 'student',
    title: 'Bonafide Certificate',
    body: `${STUDENT}is a bonafide student of {{institution}}, studying in {{className}} ({{program}}) in the academic year {{academicYear}}.\n\nThis certificate is issued for the purpose of {{purpose}}.\n\nIssued on {{issuedOn}}.`,
    fields: [],
    serialPrefix: 'BON',
  },
  {
    kind: 'conduct',
    name: 'Conduct certificate',
    subjectType: 'student',
    title: 'Conduct Certificate',
    body: `${STUDENT}a student of {{className}} at {{institution}} in the academic year {{academicYear}}, bears {{fields.conduct}} moral character and conduct, as far as the records of the institution show.\n\nIssued on {{issuedOn}} for {{purpose}}.`,
    fields: [{ key: 'conduct', label: 'Conduct (for example good, very good)', required: true }],
    serialPrefix: 'CON',
  },
  {
    kind: 'study',
    name: 'Study certificate',
    subjectType: 'student',
    title: 'Study Certificate',
    body: `${STUDENT}is studying in {{className}} ({{program}}) at {{institution}} in the academic year {{academicYear}}.\n\nIssued on {{issuedOn}} for {{purpose}}.`,
    fields: [],
    serialPrefix: 'STU',
  },
  {
    kind: 'course_completion',
    name: 'Course completion certificate',
    subjectType: 'student',
    title: 'Course Completion Certificate',
    body: `${STUDENT}has successfully completed {{program}} ({{className}}) at {{institution}} in the academic year {{academicYear}}, on {{fields.completionDate}}.\n\nIssued on {{issuedOn}}.`,
    fields: [{ key: 'completionDate', label: 'Date of completion', required: true }],
    serialPrefix: 'CC',
  },
  {
    kind: 'fee_receipt',
    name: 'Fee paid certificate',
    subjectType: 'student',
    title: 'Fee Paid Certificate',
    body: `${STUDENT}of {{className}}, has paid fees of Rs. {{fields.amount}} to {{institution}} for {{fields.period}}.\n\nThis certificate is issued for {{purpose}}. Individual payment receipts are available from the accounts office.\n\nIssued on {{issuedOn}}.`,
    fields: [
      { key: 'amount', label: 'Amount paid (rupees)', required: true },
      { key: 'period', label: 'Period or term', required: true },
    ],
    serialPrefix: 'FEE',
  },
  {
    kind: 'experience',
    name: 'Experience certificate',
    subjectType: 'staff',
    title: 'Experience Certificate',
    body: 'This is to certify that {{name}} (Employee code {{employeeCode}}) worked at {{institution}} as {{designation}} in the {{department}} department from {{dateOfJoining}} to {{fields.lastWorkingDay}}.\n\nWe found the conduct and performance satisfactory and wish them well.\n\nIssued on {{issuedOn}}.',
    fields: [{ key: 'lastWorkingDay', label: 'Last working day', required: true }],
    serialPrefix: 'EXP',
  },
];
