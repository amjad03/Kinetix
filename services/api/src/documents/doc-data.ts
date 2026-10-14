import type { CertificateKind, DocData, DocType } from '@kinetix/shared';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { academicYears, applications, departments, designations, guardians, healthProfiles, programs, sections, staffProfiles, students, users } from '../db/schema.js';
import { indianMoney, rupeesInWords } from './engine/bindings.js';
import { longDate } from './render.js';

/**
 * The data blocks documents bind to (`student.*`, `staff.*`), read from the student and staff
 * records, and small formatting helpers the generators share.
 */

export const rupees = (paise: number) => `Rs. ${indianMoney(paise / 100)}`;
export const rupeeWords = (paise: number) => rupeesInWords(paise / 100);
export const plainMoney = (paise: number) => indianMoney(paise / 100);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "June 2027" for a YYYY-MM-DD date. */
export const monthYear = (d: string | null | undefined) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '');

/** The `student` block: identity, class, programme, guardian, health and emergency details. */
export async function studentBlock(tx: Tx, studentId: string): Promise<DocData> {
  const [s] = await tx
    .select({ id: students.id, name: students.fullName, rollNo: students.rollNo, enrolledOn: students.enrolledOn, appId: students.applicationId, className: sections.displayName, program: programs.name, year: academicYears.label, yearEnds: academicYears.endsOn, phone: users.phone })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
    .leftJoin(users, eq(users.id, students.userId))
    .where(eq(students.id, studentId));
  if (!s) return { student: {} };
  const [health] = await tx.select({ blood: healthProfiles.bloodGroup, contacts: healthProfiles.emergencyContacts }).from(healthProfiles).where(eq(healthProfiles.studentId, studentId));
  const [guardian] = await tx.select({ name: users.fullName, phone: users.phone, relation: guardians.relation }).from(guardians).innerJoin(users, eq(users.id, guardians.userId)).where(and(eq(guardians.studentId, studentId), eq(guardians.isPrimary, true)));
  const [app] = s.appId ? await tx.select({ dob: applications.dateOfBirth, no: applications.applicationNo, gender: applications.gender, answers: applications.answers, guardianName: applications.guardianName, guardianPhone: applications.guardianPhone }).from(applications).where(eq(applications.id, s.appId)) : [];
  const emergency = health?.contacts?.[0];
  const guardianName = guardian?.name ?? app?.guardianName ?? '';
  const relation = guardian?.relation ? guardian.relation.replace(/^./, (c) => c.toUpperCase()) : 'Guardian';
  return {
    student: {
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      admissionNo: app?.no ?? '',
      className: s.className,
      program: s.program,
      academicYear: s.year,
      dob: app?.dob ? longDate(app.dob) : '',
      gender: app?.gender ?? '',
      bloodGroup: health?.blood ?? '',
      guardianName,
      fatherName: guardianName,
      phone: s.phone ?? '',
      emergencyContact: emergency ? `${emergency.name} (${emergency.relation})` : guardianName ? `${guardianName} (${relation})` : '',
      emergencyPhone: emergency?.phone ?? guardian?.phone ?? app?.guardianPhone ?? '',
      address: String(app?.answers?.address ?? ''),
      enrolledOn: s.enrolledOn ? longDate(s.enrolledOn) : '',
      validUntil: monthYear(s.yearEnds),
    },
  };
}

/** The `staff` block: employee code, designation, department, contacts and statutory numbers. */
export async function staffBlock(tx: Tx, userId: string): Promise<DocData> {
  const [u] = await tx
    .select({ id: users.id, name: users.fullName, phone: users.phone, email: users.email, code: staffProfiles.employeeCode, joined: staffProfiles.dateOfJoining, dob: staffProfiles.dateOfBirth, pan: staffProfiles.pan, uan: staffProfiles.uan, bank: staffProfiles.bankName, last4: staffProfiles.bankAccountLast4, designation: designations.name, department: departments.name })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
    .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
    .where(eq(users.id, userId));
  if (!u) return { staff: {} };
  const [year] = await tx.select({ ends: academicYears.endsOn }).from(academicYears).where(eq(academicYears.isCurrent, true));
  return {
    staff: {
      id: u.id,
      name: u.name,
      employeeCode: u.code ?? '',
      designation: u.designation ?? '',
      department: u.department ?? '',
      dateOfJoining: u.joined ? longDate(u.joined) : '',
      dob: u.dob ? longDate(u.dob) : '',
      bloodGroup: '',
      phone: u.phone ?? '',
      email: u.email ?? '',
      emergencyContact: '',
      emergencyPhone: '',
      address: '',
      validUntil: monthYear(year?.ends),
      pan: u.pan ?? '',
      uan: u.uan ?? '',
      bankAccount: u.last4 ? `XXXXXX${u.last4}${u.bank ? ` (${u.bank})` : ''}` : '',
    },
  };
}

/** The document type a certificate template prints as. */
export function certificateDocType(kind: CertificateKind): DocType {
  switch (kind) {
    case 'transfer_certificate':
      return 'transfer_certificate';
    case 'bonafide':
    case 'study':
      return 'bonafide_certificate';
    case 'conduct':
      return 'conduct_certificate';
    case 'course_completion':
      return 'course_completion_certificate';
    default:
      return 'generic_certificate';
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The certificate text with the subject's name in bold (the first time it appears). */
export const emphasiseName = (body: string, name: string) => (name ? body.replace(new RegExp(escapeRe(name)), `**${name}**`) : body);

/**
 * What follows the name in "This is to certify that NAME (Roll No. X), has ...": the citation a
 * landscape certificate prints under the name in display type.
 */
export function citationFrom(body: string, name: string): string {
  const first = body.split('\n').find((l) => l.trim()) ?? body;
  const m = new RegExp(`^\\s*This is to certify that\\s+${escapeRe(name)}\\s*(\\([^)]*\\))?\\s*,?\\s*`, 'i').exec(first);
  if (!m) return first.trim();
  // The identifying number in brackets stays, in front of the rest of the sentence.
  return `${m[1] ? `${m[1]} ` : ''}${first.slice(m[0].length).replace(/^\s*(who\s+)?/i, '')}`.trim();
}
