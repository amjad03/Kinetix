import { and, eq, inArray, ne, notInArray, or } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { applications, guardians, students, users } from '../db/schema.js';
import type { Application } from './admissions.service.js';

/** A name reduced to its letters and digits, lower case: "R. Kavya  Rao" and "r kavya rao" are the same. */
export const normName = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');

/** The same person despite spacing, case and punctuation; one name being the other plus a surname initial also counts. */
export function sameName(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 6 && long.startsWith(short) && long.length - short.length <= 2;
}

export interface DuplicateMatch {
  kind: 'application' | 'student';
  id: string;
  label: string;
  reasons: string[];
}

/**
 * Other records that look like this applicant: another application, or a student already on the roll, with the same
 * name and a shared date of birth or phone. The office decides; enrolment stops until it has.
 */
export async function findDuplicates(tx: Tx, a: Application): Promise<DuplicateMatch[]> {
  const out: DuplicateMatch[] = [];
  const phones = [a.phone, a.guardianPhone].filter(Boolean);
  const others = await tx
    .select()
    .from(applications)
    .where(
      and(
        ne(applications.id, a.id),
        notInArray(applications.status, ['withdrawn', 'rejected', 'declined']),
        or(inArray(applications.phone, phones), inArray(applications.guardianPhone, phones), a.dateOfBirth ? eq(applications.dateOfBirth, a.dateOfBirth) : undefined),
      ),
    );
  for (const o of others) {
    if (!sameName(a.applicantName, o.applicantName)) continue;
    const reasons: string[] = ['Same name'];
    if (a.dateOfBirth && o.dateOfBirth === a.dateOfBirth) reasons.push('Same date of birth');
    if (phones.includes(o.phone) || phones.includes(o.guardianPhone)) reasons.push('Same phone number');
    if (reasons.length > 1) out.push({ kind: 'application', id: o.id, label: `${o.applicationNo} (${o.status.replace('_', ' ')})`, reasons });
  }
  const roll = await tx
    .select({ id: students.id, name: students.fullName, rollNo: students.rollNo, status: students.status, appId: students.applicationId, guardianPhone: users.phone })
    .from(students)
    .leftJoin(guardians, eq(guardians.studentId, students.id))
    .leftJoin(users, eq(users.id, guardians.userId));
  const byStudent = new Map<string, { name: string; rollNo: string; status: string; appId: string | null; phones: string[] }>();
  for (const r of roll) {
    const e = byStudent.get(r.id) ?? { name: r.name, rollNo: r.rollNo, status: r.status, appId: r.appId, phones: [] };
    if (r.guardianPhone) e.phones.push(r.guardianPhone);
    byStudent.set(r.id, e);
  }
  const dobOf = new Map<string, string | null>();
  const appIds = [...byStudent.values()].map((s) => s.appId).filter((x): x is string => !!x);
  if (appIds.length) for (const r of await tx.select({ id: applications.id, dob: applications.dateOfBirth }).from(applications).where(inArray(applications.id, appIds))) dobOf.set(r.id, r.dob);
  for (const [id, s] of byStudent) {
    if (s.appId === a.id || !sameName(a.applicantName, s.name)) continue;
    const reasons: string[] = ['Same name'];
    if (a.dateOfBirth && s.appId && dobOf.get(s.appId) === a.dateOfBirth) reasons.push('Same date of birth');
    if (s.phones.some((ph) => phones.includes(ph))) reasons.push('Same family phone number');
    if (reasons.length > 1) out.push({ kind: 'student', id, label: `${s.name} (${s.rollNo}, ${s.status.replace('_', ' ')})`, reasons });
  }
  return out;
}
