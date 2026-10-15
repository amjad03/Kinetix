import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { resolveAffiliation } from '../affiliation/resolve.js';
import { attendanceSettings, overallAttendance, subjectAttendance } from '../attendance-governance/eligibility.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { subjectRequisites } from '../db/schema-academic-ops.js';
import { examApplicationSubjects } from '../db/schema-exam-flagship.js';
import { assessments, examFeeDues, examPapers, examRegistrations, examRegistrationWindows, examSessions, feeInvoices, marks, sections, students, subjects, supplementaryRegistrations, tenants } from '../db/schema.js';
import { officeSettings } from '../exam-office/settings.js';
import { ExamsService, REPEAT_KINDS } from '../exams/exams.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { applicationFee, applicationNo, internalPercent, subjectFee, subjectReasons, type ApplicationKind, type ApplicationRules } from './applications.logic.js';
import { auditCell, CELL, CELL_READ, rowsOf } from './common.js';
import { chargeExamFee, syncExamFees } from './exam-fees.js';
import { lateFeeFor, registrationState } from './exam-cell.logic.js';
import { cellSettings } from './settings.js';

const SubmitBody = z.object({
  studentId: z.uuid(),
  /** Backlog and improvement subjects chosen; this term's papers are always included. */
  subjectIds: z.array(z.uuid()).max(30).default([]),
});
const WithdrawBody = z.object({ reason: z.string().trim().min(3).max(300) });

export interface ApplicationSubject {
  subjectId: string;
  code: string;
  name: string;
  credits: number;
  kind: ApplicationKind;
  eligible: boolean;
  reasons: string[];
  feePaise: number;
  failedInSessionId: string | null;
  /** Whether the candidate has chosen it (always true for this term's papers). */
  chosen: boolean;
  /** When and where it is written. */
  examDate: string | null;
  startsAt: string | null;
}

/** Everything a candidate (or the office) sees on the application form of a session. */
export interface ApplicationView {
  session: { id: string; name: string; kind: string; status: string; startsOn: string; endsOn: string };
  student: { id: string; name: string; rollNo: string; section: string };
  window: { opensOn: string; closesOn: string; lateUntil: string | null; state: 'upcoming' | 'open' | 'late' | 'closed' } | null;
  rules: ApplicationRules & { basis: 'per_subject' | 'overall'; source: string };
  /** Reasons that stop the whole application (fees overdue, too many backlogs). */
  blockers: string[];
  subjects: ApplicationSubject[];
  fee: { papersPaise: number; topUpPaise: number; lateFeePaise: number; totalPaise: number; papers: number; lateSlab: string | null };
  application: {
    applicationNo: string | null;
    status: string;
    reasons: string[];
    submittedAt: string;
    fee: { amountPaise: number; status: string; receiptNo: string | null; invoiceId: string | null; invoiceNo: string | null; dueOn: string | null } | null;
  } | null;
  canSubmit: boolean;
}

/**
 * The backlog and improvement subjects a registered candidate may write become supplementary registrations, which
 * result processing reads; a candidate who is not registered has none.
 */
export async function syncRepeatRegistrations(tx: Tx, p: UserPrincipal, sessionId: string, studentId: string, registered: boolean): Promise<number> {
  await tx.delete(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, sessionId), eq(supplementaryRegistrations.studentId, studentId)));
  if (!registered) return 0;
  const rows = await tx
    .select()
    .from(examApplicationSubjects)
    .where(and(eq(examApplicationSubjects.sessionId, sessionId), eq(examApplicationSubjects.studentId, studentId), eq(examApplicationSubjects.status, 'eligible'), inArray(examApplicationSubjects.kind, ['backlog', 'improvement'])));
  const usable = rows.filter((r) => r.failedInSessionId);
  if (usable.length) await tx.insert(supplementaryRegistrations).values(usable.map((r) => ({ tenantId: p.tenantId, sessionId, studentId, subjectId: r.subjectId, failedInSessionId: r.failedInSessionId!, registeredBy: p.userId })));
  return usable.length;
}

/** Examination applications: the candidate chooses the papers, eligibility is checked per subject and the fee is raised. */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly exams: ExamsService,
    private readonly clock: Clock,
    private readonly notes: NotificationsService,
  ) {}

  async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  /** The application form of a candidate for a session: the subjects, their eligibility and the fee. */
  async view(tx: Tx, sessionId: string, studentId: string): Promise<ApplicationView> {
    const s = await this.exams.session(tx, sessionId);
    const [st] = await tx
      .select({ id: students.id, name: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, section: sections.displayName, programId: sections.programId, term: sections.term })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(students.id, studentId));
    if (!st) throw new NotFoundException('Student not found');
    if (st.programId !== s.programId) throw new BadRequestException('The student is not in this programme');
    await syncExamFees(tx, { sessionId, studentId });
    const today = await this.today(tx);
    const [w] = await tx.select().from(examRegistrationWindows).where(eq(examRegistrationWindows.sessionId, sessionId));
    const window = w ? { opensOn: w.opensOn, closesOn: w.closesOn, lateUntil: w.lateUntil, state: registrationState(w, today) } : null;

    // The rules: attendance from the settings chain (profile, rule registry, institution), condonation and NE from the profile.
    const aff = await resolveAffiliation(tx, s.programId);
    const att = await attendanceSettings(tx, st.sectionId, today);
    const rules: ApplicationView['rules'] = {
      minAttendancePercent: w?.minAttendancePercent ?? att.thresholdPct,
      condonableToPercent: aff?.rules.attendance.condonableToPercent ?? null,
      internalEligibilityPercent: aff?.rules.pass.internalEligibilityPercent ?? null,
      basis: aff?.rules.attendance.basis ?? 'per_subject',
      source: w?.minAttendancePercent != null ? 'window' : att.source,
    };

    // What the session offers: its papers by subject, with the first sitting of each.
    const papers = await tx
      .select({ subjectId: examPapers.subjectId, sectionId: examPapers.sectionId, examDate: examPapers.examDate, startsAt: examPapers.startsAt })
      .from(examPapers)
      .where(eq(examPapers.sessionId, sessionId))
      .orderBy(asc(examPapers.examDate), asc(examPapers.startsAt));
    const sittingOf = new Map<string, { examDate: string; startsAt: string }>();
    for (const p of papers) if (!sittingOf.has(p.subjectId) || p.sectionId === st.sectionId) sittingOf.set(p.subjectId, { examDate: p.examDate, startsAt: p.startsAt });

    const offered: { subjectId: string; kind: ApplicationKind; failedInSessionId: string | null }[] = [];
    const repeat = REPEAT_KINDS.includes(s.kind);
    if (!repeat && st.term === s.term) for (const p of papers) if (p.sectionId === st.sectionId && !offered.some((o) => o.subjectId === p.subjectId)) offered.push({ subjectId: p.subjectId, kind: 'regular', failedInSessionId: null });
    if (repeat) {
      const attempts = (await this.exams.latestAttempts(tx, [studentId], s.programId)).get(studentId) ?? [];
      for (const a of attempts) {
        if (!sittingOf.has(a.subjectId)) continue;
        // Supplementary and make-up sessions are for subjects not passed; improvement sessions are for passed ones, and a
        // supplementary session also takes improvement candidates.
        if (!a.passed && s.kind !== 'improvement') offered.push({ subjectId: a.subjectId, kind: 'backlog', failedInSessionId: a.sessionId });
        else if (a.passed && (s.kind === 'improvement' || s.kind === 'supplementary')) offered.push({ subjectId: a.subjectId, kind: 'improvement', failedInSessionId: a.sessionId });
      }
    }
    const subjectRows = offered.length ? await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, credits: subjects.credits }).from(subjects).where(inArray(subjects.id, offered.map((o) => o.subjectId))) : [];

    // Attendance by subject (after condonation), or overall when the profile counts it overall.
    const bySubject = new Map((await subjectAttendance(tx, [studentId], rules.minAttendancePercent)).map((a) => [a.subjectId, a.effectivePct]));
    const overall = (await overallAttendance(tx, [studentId], rules.minAttendancePercent)).get(studentId)?.effectivePct ?? null;
    // Internal marks entered so far (non-exam assessments of the subject in the student's class).
    const internals = await tx
      .select({ subjectId: assessments.subjectId, marks: marks.marks, absent: marks.absent, maxMarks: assessments.maxMarks })
      .from(assessments)
      .innerJoin(marks, and(eq(marks.assessmentId, assessments.id), eq(marks.studentId, studentId)))
      .where(and(eq(assessments.sectionId, st.sectionId), sql`${assessments.kind} <> 'exam'`));
    // Prerequisites not yet passed (results or approved credit transfers).
    const reqs = offered.length ? await tx.select({ subjectId: subjectRequisites.subjectId, requires: subjectRequisites.requiresSubjectId, code: subjects.code }).from(subjectRequisites).innerJoin(subjects, eq(subjects.id, subjectRequisites.requiresSubjectId)).where(and(inArray(subjectRequisites.subjectId, offered.map((o) => o.subjectId)), eq(subjectRequisites.kind, 'prerequisite'))) : [];
    const passed = new Set(
      (
        await rowsOf<{ subject_id: string }>(
          tx,
          sql`select l.subject_id from exam_result_lines l join exam_results r on r.id = l.result_id join exam_sessions x on x.id = r.session_id where r.student_id = ${studentId}::uuid and l.passed and x.status in ('published', 'locked')
              union select t.mapped_subject_id from credit_transfers t where t.student_id = ${studentId}::uuid and t.status = 'approved' and t.mapped_subject_id is not null`,
        )
      ).map((r) => r.subject_id),
    );

    const cfg = (await officeSettings(tx)).settings;
    const mine = await tx.select().from(examApplicationSubjects).where(and(eq(examApplicationSubjects.sessionId, sessionId), eq(examApplicationSubjects.studentId, studentId)));
    const chosenNow = new Map(mine.filter((m) => m.status !== 'withdrawn').map((m) => [m.subjectId, m]));
    const list: ApplicationSubject[] = offered.map((o) => {
      const sub = subjectRows.find((x) => x.id === o.subjectId)!;
      const reasons = subjectReasons(rules, {
        kind: o.kind,
        attendancePercent: rules.basis === 'overall' ? overall : (bySubject.get(o.subjectId) ?? null),
        internalPercent: internalPercent(internals.filter((i) => i.subjectId === o.subjectId)),
        missingPrerequisites: reqs.filter((r) => r.subjectId === o.subjectId && !passed.has(r.requires)).map((r) => r.code),
      });
      const sit = sittingOf.get(o.subjectId);
      return { subjectId: o.subjectId, code: sub.code, name: sub.name, credits: Number(sub.credits ?? 0), kind: o.kind, eligible: reasons.length === 0, reasons, feePaise: subjectFee(cfg.examFees, o.kind), failedInSessionId: o.failedInSessionId, chosen: o.kind === 'regular' || chosenNow.has(o.subjectId), examDate: sit?.examDate ?? null, startsAt: sit?.startsAt?.slice(0, 5) ?? null };
    });
    list.sort((a, b) => (a.kind === b.kind ? a.code.localeCompare(b.code) : a.kind === 'regular' ? -1 : b.kind === 'regular' ? 1 : a.kind.localeCompare(b.kind)));

    // Whole-application blockers: overdue fees (other than this session's exam fee) and too many backlogs.
    const blockers: string[] = [];
    if (!w || w.blockOnFeeDues) {
      const [due] = await tx
        .select({ paise: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}), 0)::bigint` })
        .from(feeInvoices)
        .where(and(eq(feeInvoices.studentId, studentId), eq(feeInvoices.status, 'due'), sql`${feeInvoices.dueOn} < ${today}`, sql`${feeInvoices.id} not in (select f.fee_invoice_id from exam_fee_dues f where f.session_id = ${sessionId}::uuid and f.fee_invoice_id is not null)`));
      if (Number(due?.paise ?? 0) > 0) blockers.push(`Fee dues of Rs ${(Number(due!.paise) / 100).toFixed(2)} are overdue`);
    }
    if (w?.maxBacklogs != null) {
      const backlogs = ((await this.exams.latestAttempts(tx, [studentId], s.programId)).get(studentId) ?? []).filter((l) => !l.passed).length;
      if (backlogs > w.maxBacklogs) blockers.push(`${backlogs} backlogs, more than the ${w.maxBacklogs} allowed`);
    }

    const daysLate = w && window?.state === 'late' ? Math.round((Date.parse(today) - Date.parse(w.closesOn)) / 86_400_000) : 0;
    const late = lateFeeFor((await cellSettings(tx)).lateFeeSlabs, daysLate, cfg.examFees.lateFeePaise);
    const fee = { ...applicationFee(cfg.examFees, list.filter((x) => x.chosen).map((x) => ({ kind: x.kind, eligible: x.eligible })), late.amountPaise), lateSlab: late.slab };

    const [reg] = await tx.select().from(examRegistrations).where(and(eq(examRegistrations.sessionId, sessionId), eq(examRegistrations.studentId, studentId)));
    const [feeRow] = await tx
      .select({ amountPaise: examFeeDues.amountPaise, status: examFeeDues.status, receiptNo: examFeeDues.receiptNo, invoiceId: examFeeDues.feeInvoiceId, invoiceNo: feeInvoices.invoiceNo, dueOn: feeInvoices.dueOn })
      .from(examFeeDues)
      .leftJoin(feeInvoices, eq(feeInvoices.id, examFeeDues.feeInvoiceId))
      .where(and(eq(examFeeDues.sessionId, sessionId), eq(examFeeDues.studentId, studentId)));
    const open = window?.state === 'open' || window?.state === 'late';
    const editable = !s.processedAt && (!feeRow || feeRow.status === 'due');
    return {
      session: { id: s.id, name: s.name, kind: s.kind, status: s.status, startsOn: s.startsOn, endsOn: s.endsOn },
      student: { id: st.id, name: st.name, rollNo: st.rollNo, section: st.section },
      window,
      rules,
      blockers,
      subjects: list,
      fee,
      application: reg
        ? { applicationNo: reg.applicationNo, status: reg.status, reasons: reg.reasons, submittedAt: reg.registeredAt.toISOString(), fee: feeRow ? { ...feeRow, receiptNo: feeRow.receiptNo ?? null, invoiceNo: feeRow.invoiceNo ?? null, dueOn: feeRow.dueOn ?? null } : null }
        : null,
      canSubmit: open && editable && list.length > 0,
    };
  }

  /**
   * Submits (or changes) an application: this term's papers and the chosen backlog and improvement subjects. Each subject
   * is checked; the candidate is registered when at least one subject may be written and nothing blocks the whole
   * application, else held as ineligible with the reasons (the controller can override). The fee goes on the fee account.
   */
  async submit(tx: Tx, p: UserPrincipal, sessionId: string, body: z.infer<typeof SubmitBody>, opts: { office: boolean }) {
    const v = await this.view(tx, sessionId, body.studentId);
    if (!v.window) throw new ConflictException('The examination office has not opened applications for this session');
    if (v.window.state === 'upcoming') throw new ConflictException(`Applications open on ${v.window.opensOn}`);
    if (v.window.state === 'closed' && !opts.office) throw new ConflictException(`Applications closed on ${v.window.lateUntil ?? v.window.closesOn}`);
    if (v.session.status === 'processed' || v.session.status === 'published' || v.session.status === 'locked') throw new ConflictException('Results are processed; applications can no longer change');
    if (v.application?.fee && v.application.fee.status !== 'due') throw new ConflictException('The exam fee is paid; ask the examination office to change the application');
    const optional = new Set(v.subjects.filter((x) => x.kind !== 'regular').map((x) => x.subjectId));
    for (const id of body.subjectIds) if (!optional.has(id) && !v.subjects.some((x) => x.subjectId === id && x.kind === 'regular')) throw new BadRequestException('One of the chosen subjects is not offered to this candidate in this session');
    const chosen = v.subjects.filter((x) => x.kind === 'regular' || body.subjectIds.includes(x.subjectId));
    if (chosen.length === 0) throw new BadRequestException('Choose at least one subject');

    // Replace the subject rows of this application.
    await tx.delete(examApplicationSubjects).where(and(eq(examApplicationSubjects.sessionId, sessionId), eq(examApplicationSubjects.studentId, body.studentId)));
    await tx.insert(examApplicationSubjects).values(chosen.map((x) => ({ tenantId: p.tenantId, sessionId, studentId: body.studentId, subjectId: x.subjectId, kind: x.kind, status: x.eligible ? ('eligible' as const) : ('ineligible' as const), reasons: x.reasons, feePaise: x.eligible ? x.feePaise : 0, failedInSessionId: x.failedInSessionId })));

    const fee = applicationFee((await officeSettings(tx)).settings.examFees, chosen.map((x) => ({ kind: x.kind, eligible: x.eligible })), v.fee.lateFeePaise);
    const writable = chosen.filter((x) => x.eligible);
    const reasons = [...v.blockers, ...(writable.length === 0 ? ['No subject can be written: see the reasons against each subject'] : [])];
    const status = reasons.length ? ('ineligible' as const) : ('registered' as const);
    const [prev] = await tx.select({ applicationNo: examRegistrations.applicationNo }).from(examRegistrations).where(and(eq(examRegistrations.sessionId, sessionId), eq(examRegistrations.studentId, body.studentId)));
    let no = prev?.applicationNo ?? null;
    if (!no) {
      const [{ n }] = await rowsOf<{ n: number }>(tx, sql`select count(*)::int as n from exam_registrations where application_no is not null`);
      no = applicationNo(this.clock.now().getFullYear(), n + 1);
    }
    const values = { status, reasons, registeredAt: this.clock.now(), applicationNo: no, submittedBy: p.userId, overriddenBy: null, overrideReason: null };
    await tx.insert(examRegistrations).values({ tenantId: p.tenantId, sessionId, studentId: body.studentId, ...values }).onConflictDoUpdate({ target: [examRegistrations.sessionId, examRegistrations.studentId], set: values });
    await syncRepeatRegistrations(tx, p, sessionId, body.studentId, status === 'registered');
    const charged = status === 'registered' ? await chargeExamFee(tx, p, { sessionId, studentId: body.studentId, sessionName: v.session.name, papers: fee.papers, amountPaise: fee.totalPaise, note: v.fee.lateSlab ? `Includes ${v.fee.lateSlab}` : fee.lateFeePaise ? 'Includes the late fee' : null, now: this.clock.now() }) : null;
    await auditCell(tx, p, 'exam.application.submitted', 'exam_registration', body.studentId, {
      data: { sessionId, applicationNo: no, status, subjects: chosen.map((x) => ({ code: x.code, kind: x.kind, eligible: x.eligible })), feePaise: fee.totalPaise, invoiceId: charged?.invoiceId ?? null },
    });
    if (status === 'registered' && fee.totalPaise > 0)
      await this.notes.examNotice(tx, [body.studentId], {
        kind: 'fee',
        text: {
          en: { title: 'Exam application received', body: `Application ${no} for ${v.session.name}: ${writable.length} paper(s). Pay the exam fee of Rs ${(fee.totalPaise / 100).toFixed(2)} to get the hall ticket.` },
          hi: { title: 'परीक्षा आवेदन प्राप्त', body: `${v.session.name} के लिए आवेदन ${no}: ${writable.length} प्रश्नपत्र। प्रवेश पत्र के लिए Rs ${(fee.totalPaise / 100).toFixed(2)} परीक्षा शुल्क जमा करें।` },
          kn: { title: 'ಪರೀಕ್ಷಾ ಅರ್ಜಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ', body: `${v.session.name} ಗಾಗಿ ಅರ್ಜಿ ${no}: ${writable.length} ಪತ್ರಿಕೆ(ಗಳು). ಪ್ರವೇಶ ಪತ್ರಕ್ಕಾಗಿ Rs ${(fee.totalPaise / 100).toFixed(2)} ಪರೀಕ್ಷಾ ಶುಲ್ಕ ಪಾವತಿಸಿ.` },
        },
        data: { sessionId },
        dedupeKey: `exam-application:${sessionId}:${body.studentId}`,
      });
    return this.view(tx, sessionId, body.studentId);
  }

  /** Withdraws an application whose fee is not paid yet: the subjects, the registration and the unpaid invoice go. */
  async withdraw(tx: Tx, p: UserPrincipal, sessionId: string, studentId: string, reason: string) {
    const s = await this.exams.session(tx, sessionId);
    if (s.processedAt) throw new ConflictException('Results are processed; the application can no longer be withdrawn');
    await syncExamFees(tx, { sessionId, studentId });
    const [reg] = await tx.select().from(examRegistrations).where(and(eq(examRegistrations.sessionId, sessionId), eq(examRegistrations.studentId, studentId)));
    if (!reg) throw new NotFoundException('No application for this session');
    const [due] = await tx.select().from(examFeeDues).where(and(eq(examFeeDues.sessionId, sessionId), eq(examFeeDues.studentId, studentId)));
    if (due && due.status === 'paid') throw new ConflictException('The exam fee is paid; ask the examination office about a refund');
    if (due?.feeInvoiceId) {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, due.feeInvoiceId));
      if (inv && inv.paidPaise > 0) throw new ConflictException('Part of the exam fee is paid; ask the examination office about a refund');
      if (inv) await tx.update(feeInvoices).set({ status: 'cancelled', updatedAt: this.clock.now() }).where(eq(feeInvoices.id, inv.id));
    }
    if (due) await tx.delete(examFeeDues).where(eq(examFeeDues.id, due.id));
    await tx.update(examApplicationSubjects).set({ status: 'withdrawn' }).where(and(eq(examApplicationSubjects.sessionId, sessionId), eq(examApplicationSubjects.studentId, studentId)));
    await tx.delete(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, sessionId), eq(supplementaryRegistrations.studentId, studentId)));
    await tx.delete(examRegistrations).where(and(eq(examRegistrations.sessionId, sessionId), eq(examRegistrations.studentId, studentId)));
    await auditCell(tx, p, 'exam.application.withdrawn', 'exam_registration', studentId, { data: { sessionId, applicationNo: reg.applicationNo, reason }, before: { status: reg.status, applicationNo: reg.applicationNo } });
    return { withdrawn: true };
  }

  /** Every application of a session with its subjects by kind and the fee's state (the office's list). */
  async list(tx: Tx, sessionId: string) {
    await this.exams.session(tx, sessionId);
    await syncExamFees(tx, { sessionId });
    return rowsOf(
      tx,
      sql`select r.student_id as "studentId", st.full_name as student, st.roll_no as "rollNo", sec.display_name as section, r.application_no as "applicationNo", r.status, r.reasons,
            to_char(r.registered_at, 'YYYY-MM-DD') as "submittedOn", r.overridden_by is not null as overridden,
            count(a.subject_id) filter (where a.kind = 'regular' and a.status <> 'withdrawn')::int as regular,
            count(a.subject_id) filter (where a.kind = 'backlog' and a.status <> 'withdrawn')::int as backlog,
            count(a.subject_id) filter (where a.kind = 'improvement' and a.status <> 'withdrawn')::int as improvement,
            count(a.subject_id) filter (where a.status = 'ineligible')::int as ineligible,
            f.amount_paise::float8 as "feePaise", f.status as "feeStatus", f.receipt_no as "receiptNo", i.invoice_no as "invoiceNo"
          from exam_registrations r join students st on st.id = r.student_id join sections sec on sec.id = st.section_id
          left join exam_application_subjects a on a.session_id = r.session_id and a.student_id = r.student_id
          left join exam_fee_dues f on f.session_id = r.session_id and f.student_id = r.student_id
          left join fee_invoices i on i.id = f.fee_invoice_id
          where r.session_id = ${sessionId}::uuid
          group by r.student_id, st.full_name, st.roll_no, sec.display_name, r.application_no, r.status, r.reasons, r.registered_at, r.overridden_by, f.amount_paise, f.status, f.receipt_no, i.invoice_no
          order by sec.display_name, st.roll_no`,
    );
  }

  /** A student's applications across sessions that are open, coming or recent (Student and Parent apps). */
  async forStudent(tx: Tx, studentId: string) {
    const [st] = await tx.select({ programId: sections.programId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!st) throw new NotFoundException('Student not found');
    const sessions = await tx
      .select({ id: examSessions.id })
      .from(examSessions)
      .innerJoin(examRegistrationWindows, eq(examRegistrationWindows.sessionId, examSessions.id))
      .where(and(eq(examSessions.programId, st.programId), inArray(examSessions.status, ['draft', 'scheduled'])))
      .orderBy(asc(examSessions.startsOn));
    const out: ApplicationView[] = [];
    for (const s of sessions) {
      const v = await this.view(tx, s.id, studentId).catch(() => null);
      if (v && (v.subjects.length > 0 || v.application)) out.push(v);
    }
    return out;
  }
}

@Controller('v1')
export class ApplicationsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: ApplicationsService,
  ) {}

  /** The application form of a candidate (the student, their family or the office). */
  @Get('exam-sessions/:id/application/:studentId')
  @Auth('user')
  view(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CELL_READ);
      return this.svc.view(tx, id, studentId);
    });
  }

  /** Submits or changes an application; the office may also submit after the window closes. */
  @Post('exam-sessions/:id/application')
  @HttpCode(200)
  @Auth('user')
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SubmitBody)) b: z.infer<typeof SubmitBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, CELL);
      return this.svc.submit(tx, p, id, b, { office: p.roles.some((r) => CELL.includes(r)) });
    });
  }

  @Post('exam-sessions/:id/application/:studentId/withdraw')
  @HttpCode(200)
  @Auth('user')
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(WithdrawBody)) b: z.infer<typeof WithdrawBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CELL);
      return this.svc.withdraw(tx, p, id, studentId, b.reason);
    });
  }

  @Get('exam-sessions/:id/applications')
  @Auth('user', CELL_READ)
  list(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.list(tx, id));
  }

  /** The student's open and coming applications (apps). */
  @Get('students/:studentId/exam-applications')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CELL_READ);
      return this.svc.forStudent(tx, studentId);
    });
  }
}
