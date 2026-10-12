/**
 * Exam office samples (migration 0130): numbering and fee settings, each session's workflow stages (one timetable
 * waiting for the principal), exam fees with a few dues, paper attendance with absentees, a moderation waiting for
 * approval, revaluation kinds and fees, and a sealed question paper.
 */
import { createHash } from 'node:crypto';
import { DEFAULT_SETTINGS, STAGES } from '../../exam-office/exam-office.logic.js';
import type { Ctx } from './ctx.js';
import { at, J } from './kit.js';

export async function examOffice(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const controller = c.byEmail.controller?.id ?? c.byEmail.principal.id;
  const principal = c.byEmail.principal.id;
  await k.ins(
    'exam_office_settings',
    { settings: J({ ...DEFAULT_SETTINGS, hallTicketSeries: { prefix: 'SDC/HT/{YYYY}/', next: 1001, pad: 5, suffix: '' }, certificateSeries: { prefix: 'SDC/CERT/{FY}/', next: 1, pad: 4, suffix: '' }, qpSeries: { prefix: 'SDC/QP/{YY}/', next: 1, pad: 3, suffix: '' } }), updatedBy: controller },
    { returning: false },
  );

  const sessions = await k.q<{ id: string; name: string; kind: string; status: string; startsOn: string }>('select id, name, kind, status::text as status, starts_on::text as starts_on from exam_sessions where tenant_id = $1 order by starts_on', [k.tenantId]);
  for (const s of sessions) {
    const papers = await k.q<{ id: string; sectionId: string; examDate: string; assessmentId: string | null }>('select id, section_id, exam_date::text as exam_date, assessment_id from exam_papers where session_id = $1 order by exam_date', [s.id]);
    const stage = (name: string, status = 'done', note: string | null = null, actor = controller, day = s.startsOn) => ({ sessionId: s.id, stage: name, status, actorId: actor, note, at: at(day, '11:00') });
    if (s.status === 'draft') {
      // The supplementary session: set up, its timetable waiting for the principal's approval.
      await k.ins('exam_session_stages', [stage('setup', 'done', 'Backlog papers added', controller, '2026-10-05'), stage('timetable', 'pending', 'Ten papers over six days, no clashes', controller, '2026-10-06')], { returning: false });
      continue;
    }
    const regs = await k.q<{ studentId: string; sectionId: string }>("select r.student_id, st.section_id from exam_registrations r join students st on st.id = r.student_id where r.session_id = $1 and r.status = 'registered'", [s.id]);
    const roster = regs.length ? regs : await k.q<{ studentId: string; sectionId: string }>("select distinct st.id as student_id, st.section_id from students st join exam_papers p on p.section_id = st.section_id where p.session_id = $1 and st.status = 'active'", [s.id]);
    // Exam fees: one paper's rate times the papers, never below the minimum; two candidates have not paid yet.
    const perSection = new Map<string, number>();
    for (const p of papers) perSection.set(p.sectionId, (perSection.get(p.sectionId) ?? 0) + 1);
    await k.ins(
      'exam_fee_dues',
      roster.map((r, i) => {
        const n = perSection.get(r.sectionId) ?? 0;
        const due = s.status === 'scheduled' && i % 9 === 4;
        return { sessionId: s.id, studentId: r.studentId, papers: n, amountPaise: Math.max(DEFAULT_SETTINGS.examFees.minimumPaise, n * DEFAULT_SETTINGS.examFees.perPaperPaise), status: due ? 'due' : i % 13 === 7 ? 'waived' : 'paid', receiptNo: due || i % 13 === 7 ? null : `EXF/26/${String(i + 1).padStart(4, '0')}`, note: i % 13 === 7 ? 'Fee concession (SC/ST)' : null, settledBy: due ? null : controller, settledAt: due ? null : at(s.startsOn, '15:00') };
      }),
      { returning: false },
    );
    // Attendance for papers already written: one absentee per paper, one debarred candidate in the first paper.
    let marked = 0;
    for (const [pi, p] of papers.entries()) {
      if (p.examDate > c.today) continue;
      const cands = await k.q<{ id: string }>("select id from students where section_id = $1 and status = 'active' order by roll_no", [p.sectionId]);
      if (!cands.length) continue;
      marked++;
      await k.ins('exam_attendance', cands.map((st, i) => ({ paperId: p.id, studentId: st.id, status: i === (pi * 3 + 2) % cands.length ? 'absent' : pi === 0 && i === cands.length - 1 ? 'debarred' : 'present', bookletNo: `AB${String(pi + 1).padStart(2, '0')}${String(i + 1).padStart(3, '0')}`, markedBy: controller, markedAt: at(p.examDate, '13:15') })), { returning: false });
    }
    const done = ['setup', 'timetable', 'registration', 'fees', 'hall_tickets'];
    if (marked && marked === papers.filter((p) => p.examDate <= c.today).length && papers.every((p) => p.examDate <= c.today)) done.push('conduct', 'valuation');
    const rows = done.map((name) => stage(name, 'done', name === 'timetable' ? 'Approved by the principal' : null, name === 'timetable' ? principal : controller));
    await k.ins('exam_session_stages', rows.filter((r) => STAGES.includes(r.stage as (typeof STAGES)[number])), { returning: false });

    // A moderation proposed by the controller on the first paper with marks, waiting for the principal.
    if (done.includes('valuation')) {
      const withMarks = papers.find((p) => p.assessmentId);
      if (withMarks) await k.ins('exam_moderations', { sessionId: s.id, paperId: withMarks.id, kind: 'add', value: 2, reason: 'Question 5(b) had a printing error; two marks to every candidate as agreed by the board of examiners', proposedBy: controller }, { returning: false });
    }
  }

  // Revaluation requests: the fee of their kind; the last one is a photocopy request.
  const revals = await k.q<{ id: string }>('select id from revaluation_requests where tenant_id = $1 order by created_at', [k.tenantId]);
  for (const [i, r] of revals.entries()) {
    const kind = i === revals.length - 1 && revals.length > 1 ? 'photocopy' : i % 3 === 1 ? 'retotalling' : 'revaluation';
    const fee = kind === 'photocopy' ? DEFAULT_SETTINGS.revaluation.photocopyFeePaise : kind === 'retotalling' ? DEFAULT_SETTINGS.revaluation.retotallingFeePaise : DEFAULT_SETTINGS.revaluation.revaluationFeePaise;
    await k.q('update revaluation_requests set kind = $2, fee_paise = $3 where id = $1', [r.id, kind, fee]);
  }

  // A sealed question paper: approved, locked with its fingerprint, opened 30 minutes before the exam.
  const target = await k.q<{ sessionId: string; subjectId: string; name: string; examDate: string; startsAt: string }>(
    `select p.session_id, p.subject_id, sub.name, p.exam_date::text as exam_date, p.starts_at::text as starts_at from exam_papers p join subjects sub on sub.id = p.subject_id join exam_sessions s on s.id = p.session_id
     where p.tenant_id = $1 and s.kind = 'regular' and p.exam_date > $2 and not exists (select 1 from ext_question_papers q where q.session_id = p.session_id and q.subject_id = p.subject_id) order by p.exam_date limit 2`,
    [k.tenantId, c.today],
  );
  for (const [i, t] of target.entries()) {
    const content = `${t.name}: semester end examination\nSection A: answer all ten questions (2 marks each).\nSection B: answer any five of seven questions (8 marks each).\nSection C: answer any one of two case studies (20 marks).`;
    const locked = i === 0;
    await k.ins(
      'ext_question_papers',
      {
        sessionId: t.sessionId, subjectId: t.subjectId, title: `${t.name}: end-semester paper`, content, code: `SDC/QP/26/${String(i + 1).padStart(3, '0')}`, version: 1,
        status: locked ? 'locked' : 'approved', submittedAt: at('2026-10-01'), approvedBy: principal, approvedAt: at('2026-10-03'), scrutinyNote: 'Balanced across units; internal choice fine.',
        ...(locked && { lockedAt: at('2026-10-04'), contentHash: createHash('sha256').update(content).digest('hex'), releaseAt: new Date(at(t.examDate, t.startsAt.slice(0, 5)).getTime() - 30 * 60_000) }),
      },
      { returning: false },
    );
  }
}
