/**
 * Examinations flagship samples (migrations 0186-0188): application numbers and subjects for the semester-end
 * session; the BCom semester 3 supplementary session with its papers, an open application window, backlog and
 * improvement applications whose exam fees are invoices on the fee account (some paid at the counter); question paper
 * setting for it (setters and moderators appointed, sets built from the question bank, scrutinised, locked and one
 * drawn for a sealed release, another setter still setting, one appointment unanswered); marks unlock requests.
 * Everything goes through the module's own services, so the numbers, invoices and audit trail are its own.
 */
import type { UserPrincipal } from '../../auth/principal.js';
import { ApplicationsService } from '../../exam-cell/applications.js';
import { QpSettingController } from '../../exam-cell/qp-setting.js';
import { ExamRegistrationController } from '../../exams/exam-registration.controller.js';
import { ExamSessionsController } from '../../exams/exams.controller.js';
import { FeesController } from '../../fees/fees.controller.js';
import { QuestionBankController } from '../../question-bank/question-bank.controller.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J } from './kit.js';
import { service, withTenant } from './nest.js';

export async function examFlagship(c: Ctx): Promise<void> {
  if (!c.byEmail.controller || !c.byEmail['hod.commerce']) return; // the school profile has no exam cell of this kind
  const { kit: k } = c;
  const as = (email: string, roles: UserPrincipal['roles']): UserPrincipal => ({ kind: 'user', tenantId: c.tenantId, userId: c.byEmail[email].id, roles });
  const controller = as('controller', ['exam_controller']);
  const principal = as('principal', ['principal']);
  const hod = as('hod.commerce', ['hod']);
  const accounts = c.byEmail.accounts ? as('accounts', ['accountant']) : principal;

  // 1. The semester-end session: each registration gets its application number and its papers as this term's subjects.
  const [sem5] = await k.q<{ id: string }>("select id from exam_sessions where tenant_id = $1 and kind = 'regular' and status = 'scheduled' order by starts_on desc limit 1", [c.tenantId]);
  if (sem5) {
    const regs = await k.q<{ studentId: string; status: string; reasons: string[]; sectionId: string }>('select r.student_id, r.status, r.reasons, st.section_id from exam_registrations r join students st on st.id = r.student_id where r.session_id = $1 order by st.roll_no', [sem5.id]);
    const papers = await k.q<{ subjectId: string; sectionId: string }>('select subject_id, section_id from exam_papers where session_id = $1', [sem5.id]);
    for (const [i, r] of regs.entries()) {
      await k.q('update exam_registrations set application_no = $3, submitted_by = $4 where session_id = $1 and student_id = $2', [sem5.id, r.studentId, `EXA/26/${String(i + 1).padStart(5, '0')}`, c.byEmail.controller.id]);
      const mine = papers.filter((p) => p.sectionId === r.sectionId);
      if (mine.length) await k.ins('exam_application_subjects', mine.map((p) => ({ sessionId: sem5.id, studentId: r.studentId, subjectId: p.subjectId, kind: 'regular', status: r.status === 'registered' ? 'eligible' : 'ineligible', reasons: J(r.status === 'registered' ? [] : r.reasons), feePaise: r.status === 'registered' ? 15_000 : 0 })), { returning: false });
    }
  }

  // 2. The supplementary session: papers for the semester 3 subjects, an open window, applications and fees.
  const [supp] = await k.q<{ id: string; programId: string }>("select id, program_id from exam_sessions where tenant_id = $1 and kind = 'supplementary' order by starts_on limit 1", [c.tenantId]);
  if (!supp) return;
  const sec = c.sections.find((s) => s.prog === 'BCM' && s.term === 3);
  if (!sec) return;
  const exams = await service(ExamSessionsController);
  const window = await service(ExamRegistrationController);
  const apps = await service(ApplicationsService);
  const fees = await service(FeesController);
  const day = ['2027-01-18', '2027-01-19', '2027-01-20', '2027-01-21', '2027-01-22', '2027-01-25'];
  const subjects = [...sec.subjects].sort((a, b) => a.code.localeCompare(b.code));
  for (const [i, sub] of subjects.entries()) {
    await exams.addPaper(controller, supp.id, { subjectId: sub.id, sectionId: sec.id, examDate: day[i % day.length], startsAt: '10:00', endsAt: '13:00', maxMarks: 60 } as never);
  }
  await window.setWindow(controller, supp.id, { opensOn: addDays(c.today, -4), closesOn: addDays(c.today, 12), minAttendancePercent: null, blockOnFeeDues: false, maxBacklogs: 4, lateUntil: addDays(c.today, 20) });

  // Backlog candidates (from the published model examination) and two who want to improve a passed paper.
  const backlog = await k.q<{ studentId: string; subjectId: string }>('select student_id, subject_id from supplementary_registrations where session_id = $1 order by student_id, subject_id', [supp.id]);
  const byStudent = new Map<string, string[]>();
  for (const b of backlog) byStudent.set(b.studentId, [...(byStudent.get(b.studentId) ?? []), b.subjectId]);
  const improvers = await k.q<{ studentId: string; subjectId: string }>(
    `select r.student_id, l.subject_id from exam_result_lines l join exam_results r on r.id = l.result_id join exam_sessions s on s.id = r.session_id
     where s.program_id = $1 and s.term = 3 and s.status = 'published' and l.passed and l.percent between 40 and 55 and r.outcome = 'pass' order by l.percent limit 2`,
    [supp.programId],
  );
  for (const imp of improvers) byStudent.set(imp.studentId, [...(byStudent.get(imp.studentId) ?? []), imp.subjectId]);
  const invoices: string[] = [];
  for (const [studentId, subjectIds] of byStudent) {
    const v = await withTenant(c.tenantId, (tx) => apps.submit(tx, controller, supp.id, { studentId, subjectIds }, { office: true }));
    if (v.application?.fee?.invoiceId) invoices.push(v.application.fee.invoiceId);
  }
  // Half of the candidates have paid at the counter or by UPI; the exam fee settles with the payment.
  for (const [i, inv] of invoices.entries()) {
    if (i % 2 === 1) continue;
    const [row] = await k.q<{ amountPaise: number }>('select amount_paise::int as amount_paise from fee_invoices where id = $1', [inv]);
    await fees.counter(accounts, inv, { amountPaise: Number(row.amountPaise), method: i % 4 === 0 ? 'cash' : 'upi', reference: i % 4 === 0 ? undefined : `UTR6201${String(i).padStart(4, '0')}` });
  }

  // 3. Question paper setting for the supplementary papers.
  const qp = await service(QpSettingController);
  const qb = await service(QuestionBankController);
  const code = (cd: string) => subjects.find((s) => s.code === cd);
  const [bcm301, bcm302, bcm303] = [code('BCM-301'), code('BCM-302'), code('BCM-303')];
  if (bcm301 && bcm302 && bcm303) {
    const setter1 = c.byEmail['sudhir.kamath'] ? as('sudhir.kamath', ['teacher']) : principal;
    const setter2 = c.byEmail['deepa.nair'] ? as('deepa.nair', ['teacher']) : principal;
    const appoint = (subjectId: string, role: 'setter' | 'moderator', userId: string, dueOn: string, setsRequired = 2, remunerationPaise = 150_000) => qp.appoint(controller, supp.id, { subjectId, role, userId, setsRequired, dueOn, remunerationPaise, note: role === 'setter' ? 'Two sets as per the BCU blueprint; avoid questions from the last three papers.' : undefined });
    // Corporate Accounting: both sets made, scrutinised by the head of department, locked and one drawn.
    const s1 = await appoint(bcm301.id, 'setter', setter1.userId, addDays(c.today, 10));
    const m1 = await appoint(bcm301.id, 'moderator', hod.userId, addDays(c.today, 14), 0, 75_000);
    await qp.respond(setter1, s1.id, { accept: true });
    await qp.respond(hod, m1.id, { accept: true });
    const [bp1] = await k.q<{ id: string }>('select id from qb_blueprints where subject_id = $1 order by created_at limit 1', [bcm301.id]);
    if (bp1) {
      for (const label of ['A', 'B']) {
        const set = await qb.createPaper(setter1, { blueprintId: bp1.id, title: 'BCM-301 Corporate Accounting: supplementary examination', seed: `sdc-supp-301-${label}`, avoidLast: 3, sessionId: supp.id, setLabel: label });
        await qb.submit(setter1, set.id, { moderatorId: hod.userId });
        await qb.scrutiny(hod, set.id, { decision: 'approve', remarks: '' });
        await qb.lock(principal, set.id);
      }
      await qp.draw(controller, supp.id, bcm301.id);
    }
    // Cost Accounting: the setter accepted and handed one set to the moderator; the second is still a draft.
    const s2 = await appoint(bcm302.id, 'setter', setter2.userId, addDays(c.today, 12));
    const m2 = await appoint(bcm302.id, 'moderator', hod.userId, addDays(c.today, 16), 0, 75_000);
    await qp.respond(setter2, s2.id, { accept: true });
    await qp.respond(hod, m2.id, { accept: true });
    const [bp2] = await k.q<{ id: string }>('select id from qb_blueprints where subject_id = $1 order by created_at limit 1', [bcm302.id]);
    if (bp2) {
      const a = await qb.createPaper(setter2, { blueprintId: bp2.id, title: 'BCM-302 Cost Accounting: supplementary examination', seed: 'sdc-supp-302-A', avoidLast: 3, sessionId: supp.id, setLabel: 'A' });
      await qb.submit(setter2, a.id, { moderatorId: hod.userId });
      await qb.createPaper(setter2, { blueprintId: bp2.id, title: 'BCM-302 Cost Accounting: supplementary examination', seed: 'sdc-supp-302-B', avoidLast: 3, sessionId: supp.id, setLabel: 'B' });
    }
    // Company Law: appointed a week ago, not answered yet and past its due date.
    const s3 = await appoint(bcm303.id, 'setter', (c.byEmail['sowmya.reddy'] ?? c.byEmail['deepa.nair']).id, addDays(c.today, -1));
    await k.q('update qp_appointments set created_at = $2 where id = $1', [s3.id, at(addDays(c.today, -7), '10:00')]);
  }

  // 4. Marks unlock requests: an internal test of the semester-end class submitted for verification, and one decided.
  const teacher = c.byEmail['sudhir.kamath'];
  const [slot] = teacher ? await k.q<{ sectionId: string; subjectId: string }>('select section_id, subject_id from timetable_slots where tenant_id = $1 and teacher_id = $2 order by section_id limit 1', [c.tenantId, teacher.id]) : [];
  if (teacher && slot) {
    const roster = await k.q<{ id: string }>("select id from students where section_id = $1 and status = 'active' order by roll_no", [slot.sectionId]);
    const make = async (title: string, held: string) => {
      const a = await k.one<{ id: string }>('assessments', { sectionId: slot.sectionId, subjectId: slot.subjectId, title, kind: 'test', maxMarks: 20, heldOn: held, createdBy: teacher.id, markStatus: 'submitted', submittedAt: at(addDays(held, 2), '16:00') });
      await k.ins('marks', roster.map((st, i) => ({ assessmentId: a.id, studentId: st.id, marks: 8 + ((i * 7) % 12), absent: false })), { returning: false });
      return a.id;
    };
    const pending = await make('Internal test 2 (unit 3 and 4)', addDays(c.today, -6));
    const decided = await make('Class test: case analysis', addDays(c.today, -14));
    await k.ins('marks_unlock_requests', [
      { assessmentId: pending, requestedBy: teacher.id, reason: 'Two answer scripts were totalled wrongly (roll numbers 7 and 12); I need to correct the marks before verification.', status: 'pending' },
      { assessmentId: decided, requestedBy: teacher.id, reason: 'A student absent on the day wrote the test later with permission; marks to be added.', status: 'approved', decidedBy: c.byEmail['hod.commerce'].id, decidedAt: at(addDays(c.today, -9), '11:30'), decisionNote: 'Allowed once; resubmit today.' },
    ], { returning: false });
  }
}
