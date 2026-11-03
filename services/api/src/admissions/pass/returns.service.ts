import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../db/db.service.js';
import { admissionChecklistItems, admissionProgrammeSettings } from '../../db/schema-admissions-pass.js';
import { studentProfiles } from '../../db/schema-sis.js';
import { academicYears, admissionAllotments, admissionCycles, admissionRounds, applicationPayments, applications, programs, students } from '../../db/schema.js';
import { categoryOf } from '../admissions.service.js';
import { categoryKey, MERIT, SUPERNUMERARY_KINDS } from './reservation.js';

/** The applicant-facing word for each status, and what happens next. */
const STATUS_TEXT: Record<string, { label: string; next: string }> = {
  submitted: { label: 'Received', next: 'Pay the application fee if one is due; the office then reviews the application.' },
  under_review: { label: 'Under review', next: 'The office is checking the application and the documents.' },
  correction_requested: { label: 'Correction needed', next: 'Open your application link and correct what the office asked for.' },
  eligible: { label: 'Eligible', next: 'You are on the merit list; seats are offered in rank order.' },
  ineligible: { label: 'Not eligible', next: 'The application does not meet the eligibility rules. Contact the office if you think this is wrong.' },
  waitlisted: { label: 'Waitlisted', next: 'A seat is offered if one comes free; watch for an SMS from the college.' },
  offered: { label: 'Seat offered', next: 'Accept the offer before it expires, then report with the documents and fee.' },
  accepted: { label: 'Seat accepted', next: 'Report to the admissions office with the original documents to complete admission.' },
  declined: { label: 'Offer declined', next: 'This application is closed.' },
  rejected: { label: 'Not selected', next: 'This application is closed.' },
  withdrawn: { label: 'Withdrawn', next: 'This application is closed.' },
  enrolled: { label: 'Admitted', next: 'Welcome. Sign in to the student app with your mobile number.' },
};

/** AISHE DCF-II social categories from the matrix keys (Karnataka's Category-1 to 3B report as OBC). */
export function aisheCategory(raw: string | null | undefined): 'General' | 'EWS' | 'SC' | 'ST' | 'OBC' {
  const k = categoryKey(raw);
  if (k === MERIT) return 'General';
  if (k === 'sc' || k === 'st') return k.toUpperCase() as 'SC' | 'ST';
  if (k === 'ews') return 'EWS';
  if (['obc', 'cat-1', '2a', '2b', '3a', '3b', 'bc', 'mbc'].includes(k)) return 'OBC';
  return 'General';
}

const maskName = (n: string) =>
  n
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w : `${w[0] ?? ''}.`))
    .join(' ');

/** What admissions files and publishes: the public status lookup, university approval lists, intake and AISHE returns. */
@Injectable()
export class AdmissionReturnsService {
  /**
   * The public status page: application number and date of birth, nothing else. Answers the stage the application has
   * reached with a first name and initials only; a wrong pair is a plain 404 (the caller rate-limits).
   */
  async publicStatus(tx: Tx, applicationNo: string, dateOfBirth: string) {
    const [row] = await tx
      .select({ a: applications, cycle: admissionCycles.name, programme: programs.name })
      .from(applications)
      .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
      .innerJoin(programs, eq(programs.id, admissionCycles.programId))
      .where(eq(sql`upper(${applications.applicationNo})`, applicationNo.trim().toUpperCase()));
    if (!row || !row.a.dateOfBirth || row.a.dateOfBirth !== dateOfBirth) throw new NotFoundException('No application matches that number and date of birth');
    const a = row.a;
    const [paid] = await tx.select({ n: sql<number>`count(*)::int` }).from(applicationPayments).where(and(eq(applicationPayments.applicationId, a.id), eq(applicationPayments.status, 'paid')));
    const [rd] = await tx
      .select({ roundNo: admissionRounds.roundNo, option: admissionAllotments.optionLabel, response: admissionAllotments.response })
      .from(admissionAllotments)
      .innerJoin(admissionRounds, eq(admissionRounds.id, admissionAllotments.roundId))
      .where(and(eq(admissionAllotments.applicationId, a.id), inArray(admissionRounds.status, ['published', 'closed'])))
      .orderBy(sql`${admissionRounds.roundNo} desc`)
      .limit(1);
    const pending = await tx.select({ label: admissionChecklistItems.label, dueOn: admissionChecklistItems.dueOn }).from(admissionChecklistItems).where(and(eq(admissionChecklistItems.applicationId, a.id), eq(admissionChecklistItems.required, true), inArray(admissionChecklistItems.status, ['pending', 'deferred'])));
    const done = (s: string[]) => s.includes(a.status);
    const after = (k: string[]) => ['eligible', 'waitlisted', 'offered', 'accepted', 'enrolled', ...k].includes(a.status);
    const text = STATUS_TEXT[a.status] ?? { label: a.status, next: '' };
    return {
      applicationNo: a.applicationNo,
      applicant: maskName(a.applicantName),
      programme: row.programme,
      cycle: row.cycle,
      status: a.status,
      statusLabel: text.label,
      next: a.provisional && pending.length ? `Admitted provisionally. Hand in ${pending.map((p) => p.label).join(', ')} by ${pending.map((p) => p.dueOn).filter(Boolean).sort()[0] ?? 'the due date'}.` : text.next,
      steps: [
        { key: 'submitted', label: 'Application received', done: true, at: a.submittedAt.toISOString().slice(0, 10) },
        { key: 'fee', label: 'Application fee', done: a.feeStatus === 'paid' || a.feeStatus === 'waived' || a.feeStatus === 'none' || paid.n > 0 },
        { key: 'review', label: 'Documents and eligibility checked', done: after(['ineligible']) },
        { key: 'merit', label: a.meritRank ? `Merit rank ${a.meritRank}` : 'Merit list', done: !!a.meritRank || done(['waitlisted', 'offered', 'accepted', 'enrolled']) },
        { key: 'seat', label: rd ? `Round ${rd.roundNo}: ${rd.option}` : 'Seat offered', done: done(['offered', 'accepted', 'enrolled']) },
        { key: 'admission', label: a.provisional ? 'Admitted provisionally' : 'Admission', done: done(['enrolled']) },
      ],
      pendingDocuments: pending.map((p) => ({ label: p.label, dueOn: p.dueOn })),
      offerExpiresOn: a.status === 'offered' ? a.offerExpiresOn : null,
    };
  }

  /**
   * The list the affiliating university approves admissions from (VTU's admission approval, the state universities'
   * ratification): every student admitted through a cycle, with the particulars the university asks for.
   */
  async approvalList(tx: Tx, q: { cycleId?: string; programId?: string; yearId?: string }) {
    const conds = [eq(applications.status, 'enrolled')];
    if (q.cycleId) conds.push(eq(applications.cycleId, q.cycleId));
    if (q.programId) conds.push(eq(admissionCycles.programId, q.programId));
    if (q.yearId) conds.push(eq(admissionCycles.academicYearId, q.yearId));
    const rows = await tx
      .select({ a: applications, programme: programs.name, programId: programs.id, year: academicYears.label, registerNo: studentProfiles.registerNo, admissionNo: studentProfiles.admissionNo, enrolledOn: students.enrolledOn })
      .from(applications)
      .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
      .innerJoin(programs, eq(programs.id, admissionCycles.programId))
      .innerJoin(academicYears, eq(academicYears.id, admissionCycles.academicYearId))
      .leftJoin(students, eq(students.id, applications.studentId))
      .leftJoin(studentProfiles, eq(studentProfiles.studentId, applications.studentId))
      .where(and(...conds))
      .orderBy(asc(programs.name), asc(applications.seatType), asc(applications.applicantName))
      .limit(5000);
    const ids = rows.map((r) => r.a.id);
    const elig = ids.length ? await tx.select({ applicationId: admissionChecklistItems.applicationId, itemKey: admissionChecklistItems.itemKey, status: admissionChecklistItems.status, ref: admissionChecklistItems.referenceNo }).from(admissionChecklistItems).where(and(inArray(admissionChecklistItems.applicationId, ids), inArray(admissionChecklistItems.itemKey, ['eligibility', 'migration', 'tc']))) : [];
    const doc = (id: string, key: string) => elig.find((e) => e.applicationId === id && e.itemKey === key);
    const settings = await tx.select().from(admissionProgrammeSettings);
    const list = rows.map((r, i) => ({
      slNo: i + 1,
      programme: r.programme,
      academicYear: r.year,
      applicationNo: r.a.applicationNo,
      admissionNo: r.admissionNo,
      registerNo: r.registerNo,
      name: r.a.applicantName,
      gender: r.a.gender,
      dateOfBirth: r.a.dateOfBirth,
      category: (r.a.category ?? categoryOf(r.a) ?? '').toUpperCase(),
      seatType: r.a.seatType ?? r.a.quota,
      admissionType: r.a.admissionType,
      qualifying: String(r.a.answers?.qualifying_exam ?? r.a.answers?.board ?? ''),
      qualifyingPercent: Number(r.a.answers?.qualifying_percent ?? r.a.answers?.marks_12th ?? NaN) || null,
      entrance: r.a.entranceExam ? `${r.a.entranceExam.toUpperCase()}${r.a.entranceRank ? ` rank ${r.a.entranceRank}` : ''}` : null,
      allotmentRef: r.a.externalAllotmentRef,
      admittedOn: r.enrolledOn,
      provisional: r.a.provisional,
      eligibilityCertificate: doc(r.a.id, 'eligibility') ? `${doc(r.a.id, 'eligibility')!.status}${doc(r.a.id, 'eligibility')!.ref ? ` (${doc(r.a.id, 'eligibility')!.ref})` : ''}` : 'not required',
      transferCertificate: doc(r.a.id, 'tc')?.status ?? null,
    }));
    const byProgramme = [...new Set(rows.map((r) => r.programId))].map((pid) => {
      const mine = rows.filter((r) => r.programId === pid);
      const s = settings.find((x) => x.programId === pid);
      return { programId: pid, programme: mine[0].programme, sanctionedIntake: s?.sanctionedIntake ?? null, approvalRef: s?.approvalRef ?? null, admitted: mine.length, bySeatType: Object.fromEntries([...new Set(mine.map((m) => m.a.seatType ?? m.a.quota))].map((t) => [t, mine.filter((m) => (m.a.seatType ?? m.a.quota) === t).length])), provisional: mine.filter((m) => m.a.provisional).length, vacant: s?.sanctionedIntake != null ? Math.max(0, s.sanctionedIntake - mine.filter((m) => m.a.admissionType !== 'lateral').length) : null };
    });
    return { rows: list, byProgramme };
  }

  /** Intake against approval for every programme of a year: sanctioned, admitted by seat type, lateral, supernumerary, vacant. */
  async intakeReturn(tx: Tx, yearId: string) {
    const progs = await tx.select({ id: programs.id, name: programs.name, level: programs.level }).from(programs).orderBy(asc(programs.sortOrder), asc(programs.name));
    const settings = await tx.select().from(admissionProgrammeSettings);
    const seatTypeExpr = sql<string>`coalesce(${applications.seatType}, ${applications.quota})`;
    const grouped = await tx
      .select({ programId: admissionCycles.programId, seatType: seatTypeExpr, admissionType: applications.admissionType, seatCategory: applications.seatCategory, n: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
      .where(and(eq(applications.status, 'enrolled'), eq(admissionCycles.academicYearId, yearId)))
      .groupBy(admissionCycles.programId, seatTypeExpr, applications.admissionType, applications.seatCategory);
    // A seat in a supernumerary row (TFW, foreign nationals…) is outside the sanctioned intake.
    const counts = grouped.map((x) => ({ ...x, supernumerary: (SUPERNUMERARY_KINDS as readonly string[]).includes(x.seatCategory ?? '') }));
    const seats = await tx.select({ programId: admissionCycles.programId, n: sql<number>`sum(${admissionCycles.seats})::int` }).from(admissionCycles).where(eq(admissionCycles.academicYearId, yearId)).groupBy(admissionCycles.programId);
    return progs
      .map((p) => {
        const c = counts.filter((x) => x.programId === p.id);
        const s = settings.find((x) => x.programId === p.id);
        const regular = c.filter((x) => x.admissionType !== 'lateral' && !x.supernumerary).reduce((n, x) => n + x.n, 0);
        const sanctioned = s?.sanctionedIntake ?? seats.find((x) => x.programId === p.id)?.n ?? null;
        return {
          programId: p.id,
          programme: p.name,
          level: p.level,
          sanctionedIntake: sanctioned,
          approvalBody: s?.approvalBody ?? null,
          approvalRef: s?.approvalRef ?? null,
          approvalValidTo: s?.approvalValidTo ?? null,
          admitted: regular,
          bySeatType: Object.fromEntries([...new Set(c.filter((x) => !x.supernumerary && x.admissionType !== 'lateral').map((x) => x.seatType))].map((t) => [t, c.filter((x) => x.seatType === t && !x.supernumerary && x.admissionType !== 'lateral').reduce((n, x) => n + x.n, 0)])),
          lateral: c.filter((x) => x.admissionType === 'lateral').reduce((n, x) => n + x.n, 0),
          transfer: c.filter((x) => x.admissionType === 'transfer').reduce((n, x) => n + x.n, 0),
          supernumerary: c.filter((x) => x.supernumerary).reduce((n, x) => n + x.n, 0),
          vacant: sanctioned != null ? Math.max(0, sanctioned - regular) : null,
          fillPercent: sanctioned ? Math.round((regular * 1000) / sanctioned) / 10 : null,
        };
      })
      .filter((r) => r.sanctionedIntake != null || r.admitted > 0);
  }

  /**
   * AISHE DCF-II block 5 for the students admitted in a year: programme × social category × gender, with persons with
   * disabilities, Muslim and other minorities and foreign nationals, from the student profile filled at admission.
   */
  async aisheEnrolment(tx: Tx, yearId: string) {
    const rows = await tx
      .select({ programme: programs.name, level: programs.level, category: sql<string>`coalesce(${studentProfiles.category}, ${applications.category}, '')`, gender: sql<string>`coalesce(${studentProfiles.gender}, ${applications.gender}, '')`, disability: studentProfiles.disability, religion: studentProfiles.religion, minority: studentProfiles.isMinority, nationality: sql<string>`coalesce(${studentProfiles.nationality}, 'Indian')` })
      .from(applications)
      .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
      .innerJoin(programs, eq(programs.id, admissionCycles.programId))
      .leftJoin(studentProfiles, eq(studentProfiles.studentId, applications.studentId))
      .where(and(eq(applications.status, 'enrolled'), eq(admissionCycles.academicYearId, yearId)));
    const g = (s: string) => (/^f/i.test(s) ? 'female' : /^m/i.test(s) ? 'male' : /^(o|t)/i.test(s) ? 'transgender' : 'male');
    const progs = [...new Set(rows.map((r) => r.programme))].sort();
    const table = progs.map((p) => {
      const mine = rows.filter((r) => r.programme === p);
      const cell = (cat: string) => ({ male: mine.filter((r) => aisheCategory(r.category) === cat && g(r.gender) === 'male').length, female: mine.filter((r) => aisheCategory(r.category) === cat && g(r.gender) === 'female').length, transgender: mine.filter((r) => aisheCategory(r.category) === cat && g(r.gender) === 'transgender').length });
      const by = (f: (r: (typeof mine)[number]) => boolean) => ({ male: mine.filter((r) => f(r) && g(r.gender) === 'male').length, female: mine.filter((r) => f(r) && g(r.gender) === 'female').length });
      return {
        programme: p,
        level: mine[0].level,
        general: cell('General'),
        ews: cell('EWS'),
        sc: cell('SC'),
        st: cell('ST'),
        obc: cell('OBC'),
        total: { male: mine.filter((r) => g(r.gender) === 'male').length, female: mine.filter((r) => g(r.gender) === 'female').length, transgender: mine.filter((r) => g(r.gender) === 'transgender').length },
        pwd: by((r) => !!r.disability),
        muslimMinority: by((r) => /muslim|islam/i.test(r.religion ?? '')),
        otherMinority: by((r) => !!r.minority && !/muslim|islam/i.test(r.religion ?? '')),
        foreign: by((r) => !/^indian/i.test(r.nationality)),
      };
    });
    return { yearId, rows: table, admitted: rows.length };
  }
}
