import { IssuedDocsService } from '../documents/issued-docs.service.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, examAttendance, examFeeDues, examModerations, examOfficeSettings, examPapers, examRegistrations, examSessions, examSessionStages, extQuestionPapers, gradeScales, hallTickets, marks } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { APPROVAL_STAGES, currentStage, examFee, formatSeries, moderate, moderationProblem, passStats, QP_FLOW, stageBlocker, stageStates, STAGES, withDefaults, type OfficeSettings, type Stage, type StageFacts, type StageRow } from './exam-office.logic.js';
import { officeSettings } from './settings.js';
import { lateFeeFor } from '../exam-cell/exam-cell.logic.js';
import { chargeExamFee, syncExamFees } from '../exam-cell/exam-fees.js';
import { feeInvoices } from '../db/schema.js';
import { cellSettings } from '../exam-cell/settings.js';

export const KINDS = ['session', 'paper', 'registration', 'hall_ticket', 'question_paper', 'script', 'examiner', 'result', 'revaluation', 'certificate'] as const;
export type Kind = (typeof KINDS)[number];
export const REPORTS = ['registration_summary', 'hall_tickets', 'seating_plan', 'invigilation', 'attendance', 'malpractice', 'valuation_status', 'tabulation', 'result_analysis', 'revaluation_outcomes', 'pass_fail'] as const;
export type Report = (typeof REPORTS)[number];

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type Format = 'date' | 'datetime' | 'money' | 'percent' | 'status' | 'text';
type Row = Record<string, unknown>;
export interface Fact {
  key: string;
  value: string | number | null;
  format?: Format;
}
export interface Related {
  key: string;
  columns: { key: string; format?: Format }[];
  rows: Row[];
}
export interface RecordAction {
  key: string;
  /** What the action asks for: a comment, a receipt number, marks, a release time, absentees or a moderation. */
  input?: 'comment' | 'receipt' | 'marks' | 'datetime' | 'absentees' | 'moderation';
  /** Why the action is not available yet; the button is shown disabled with this hint. */
  blocked?: string;
  tone?: 'primary' | 'outline' | 'danger';
}
export interface RecordView {
  kind: Kind;
  id: string;
  title: string;
  subtitle: string | null;
  status: { key: string; tone: Tone };
  facts: Fact[];
  overview: Fact[];
  related: Related[];
  steps: { key: string; state: 'done' | 'current' | 'upcoming' | 'rejected'; by: string | null; at: string | null; note: string | null }[] | null;
  approval: { key: string; canDecide: boolean } | null;
  actions: RecordAction[];
  documents: { key: string; href: string }[];
  activity: { id: string; at: string; actor: string; action: string; note: string | null }[];
  /** For the "candidates" picker of the attendance action. */
  candidates?: { id: string; name: string; rollNo: string; status: string }[];
  sessionId?: string;
}

const APPROVERS = new Set(['principal', 'tenant_admin', 'exam_controller']);
const TONES: Record<string, Tone> = {
  done: 'success', approved: 'success', published: 'success', registered: 'success', issued: 'success', paid: 'success', present: 'success', completed: 'success', released: 'success', applied: 'success', finalised: 'success', pass: 'success', passed: 'success', locked: 'info', valued: 'info',
  pending: 'warning', requested: 'warning', scrutiny: 'warning', proposed: 'warning', due: 'warning', accepted: 'warning', processed: 'warning', scheduled: 'info', allocated: 'info', uploaded: 'neutral', needs_third: 'warning', invited: 'neutral', active: 'success', submitted: 'warning',
  rejected: 'danger', ineligible: 'danger', blocked: 'danger', absent: 'danger', debarred: 'danger', fail: 'danger', reported: 'danger', penalised: 'danger', cancelled: 'neutral', waived: 'neutral', draft: 'neutral', dismissed: 'neutral',
};
const tone = (s: string): Tone => TONES[s] ?? 'neutral';
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
const num = (v: unknown) => (v == null ? null : Number(v));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "sessionId_studentId" for a candidate's registration or hall ticket. */
function pair(id: string): [string, string] {
  const [a, b] = id.split('_');
  if (!a || !b || !UUID.test(a) || !UUID.test(b)) throw new NotFoundException('Record not found');
  return [a, b];
}

@Injectable()
export class ExamOfficeService {
  constructor(
    private readonly db: DbService,
    private readonly notes: NotificationsService,
    private readonly tasks: TasksService,
    private readonly issued: IssuedDocsService,
  ) {}

  private async q<T = Row>(tx: Tx, query: SQL): Promise<T[]> {
    return (await tx.execute(query)).rows as T[];
  }

  private async one<T = Row>(tx: Tx, query: SQL): Promise<T> {
    const [r] = await this.q<T>(tx, query);
    if (!r) throw new NotFoundException('Record not found');
    return r;
  }

  /** The audit trail of a record, newest first, with the actor's name. */
  private async activity(tx: Tx, where: SQL) {
    const rows = await this.q<{ id: number; at: Date; actor: string | null; action: string; data: Record<string, unknown> | null }>(
      tx,
      sql`select a.id, a.at, u.full_name as actor, a.action, a.data from audit_log a left join users u on u.id = a.actor_id where ${where} order by a.at desc limit 50`,
    );
    return rows.map((r) => ({ id: String(r.id), at: iso(r.at)!, actor: r.actor ?? 'System', action: r.action, note: typeof r.data?.note === 'string' ? r.data.note : typeof r.data?.comment === 'string' ? r.data.comment : null }));
  }

  // ---- lists ----------------------------------------------------------------------------------

  list(p: UserPrincipal, kind: Kind, sessionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = sessionId && UUID.test(sessionId) ? sessionId : null;
      const bySession = (col: SQL) => (s ? sql`and ${col} = ${s}::uuid` : sql``);
      switch (kind) {
        case 'session':
          return this.q(tx, sql`select s.id, s.name as title, pr.name as ref, s.name as session, s.status, s.starts_on as date from exam_sessions s join programs pr on pr.id = s.program_id order by s.starts_on desc`);
        case 'paper':
          return this.q(tx, sql`select p.id, sub.name as title, sec.display_name as ref, s.name as session, case when exists (select 1 from exam_attendance a where a.paper_id = p.id) then 'done' else s.status::text end as status, p.exam_date as date from exam_papers p join exam_sessions s on s.id = p.session_id join subjects sub on sub.id = p.subject_id join sections sec on sec.id = p.section_id where true ${bySession(sql`p.session_id`)} order by p.exam_date, p.starts_at`);
        case 'registration':
          return this.q(tx, sql`select r.session_id || '_' || r.student_id as id, st.full_name as title, st.roll_no as ref, s.name as session, r.status, r.registered_at as date from exam_registrations r join students st on st.id = r.student_id join exam_sessions s on s.id = r.session_id where true ${bySession(sql`r.session_id`)} order by st.roll_no`);
        case 'hall_ticket':
          return this.q(tx, sql`select h.session_id || '_' || h.student_id as id, st.full_name as title, h.ticket_no as ref, s.name as session, case when h.blocked then 'blocked' else 'issued' end as status, h.issued_at as date from hall_tickets h join students st on st.id = h.student_id join exam_sessions s on s.id = h.session_id where true ${bySession(sql`h.session_id`)} order by h.ticket_no`);
        case 'question_paper':
          return this.q(tx, sql`select q.id, q.title, coalesce(q.code, sub.code) as ref, s.name as session, q.status, q.updated_at as date from ext_question_papers q join subjects sub on sub.id = q.subject_id join exam_sessions s on s.id = q.session_id where true ${bySession(sql`q.session_id`)} order by q.updated_at desc`);
        case 'script':
          return this.q(tx, sql`select e.id, e.dummy_no as title, sub.name as ref, s.name as session, e.status, e.created_at as date from eval_scripts e join exam_papers p on p.id = e.paper_id join subjects sub on sub.id = p.subject_id join exam_sessions s on s.id = p.session_id where true ${bySession(sql`p.session_id`)} order by e.dummy_no`);
        case 'examiner':
          return this.q(tx, sql`select x.id, u.full_name as title, x.organisation as ref, (select string_agg(distinct s.name, ', ') from ext_examiner_assignments a join exam_sessions s on s.id = a.session_id where a.examiner_id = x.id) as session, case when exists (select 1 from ext_examiner_assignments a where a.examiner_id = x.id and a.status = 'active') then 'active' else 'invited' end as status, x.created_at as date from ext_examiners x join users u on u.id = x.user_id order by u.full_name`);
        case 'result':
          return this.q(tx, sql`select r.id, st.full_name as title, st.roll_no as ref, s.name as session, r.outcome as status, r.computed_at as date from exam_results r join students st on st.id = r.student_id join exam_sessions s on s.id = r.session_id where true ${bySession(sql`r.session_id`)} order by st.roll_no`);
        case 'revaluation':
          return this.q(tx, sql`select r.id, st.full_name as title, sub.name as ref, s.name as session, r.status::text as status, r.created_at as date from revaluation_requests r join students st on st.id = r.student_id join subjects sub on sub.id = r.subject_id join exam_sessions s on s.id = r.session_id where true ${bySession(sql`r.session_id`)} order by r.created_at desc`);
        case 'certificate':
          return this.q(tx, sql`select d.id, st.full_name as title, coalesce(d.serial_no, d.kind) as ref, d.kind as session, d.status, d.created_at as date from academic_doc_requests d join students st on st.id = d.student_id order by d.created_at desc`);
      }
    });
  }

  // ---- records --------------------------------------------------------------------------------

  record(p: UserPrincipal, kind: Kind, id: string): Promise<RecordView> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      // Exam fees paid on the fee account settle before they are shown.
      if (kind === 'registration' || kind === 'session') await syncExamFees(tx, {});
      switch (kind) {
        case 'session':
          return this.sessionRecord(tx, p, id);
        case 'paper':
          return this.paperRecord(tx, p, id);
        case 'registration':
          return this.registrationRecord(tx, id);
        case 'hall_ticket':
          return this.ticketRecord(tx, id);
        case 'question_paper':
          return this.qpRecord(tx, p, id);
        case 'script':
          return this.scriptRecord(tx, id);
        case 'examiner':
          return this.examinerRecord(tx, id);
        case 'result':
          return this.resultRecord(tx, id);
        case 'revaluation':
          return this.revaluationRecord(tx, p, id);
        case 'certificate':
          return this.certificateRecord(tx, p, id);
      }
    });
  }

  /** The figures the session workflow checks before a stage closes. */
  private async facts(tx: Tx, id: string): Promise<StageFacts & { approvalRequestedBy: string | null; approvalRequestedAt: Date | null; name: string; kind: string }> {
    const r = await this.one<Row>(
      tx,
      sql`select s.name, s.kind, s.status, s.approval_required, s.approved_at, s.approval_requested_by, s.approval_requested_at,
        (select count(*) from exam_papers p where p.session_id = s.id) as papers,
        exists (select 1 from exam_registration_windows w where w.session_id = s.id) as has_window,
        (select count(*) from exam_registrations r where r.session_id = s.id and r.status = 'registered') as registrations,
        (select count(*) from exam_fee_dues f where f.session_id = s.id) as fee_dues,
        (select count(*) from exam_fee_dues f where f.session_id = s.id and f.status = 'due') as fee_open,
        (select count(*) from hall_tickets h where h.session_id = s.id and not h.blocked) as tickets,
        (select count(*) from exam_papers p where p.session_id = s.id and p.exam_date <= current_date) as papers_held,
        (select count(distinct a.paper_id) from exam_attendance a join exam_papers p on p.id = a.paper_id where p.session_id = s.id) as papers_with_attendance,
        (select count(*) from eval_scripts e join exam_papers p on p.id = e.paper_id where p.session_id = s.id) as scripts,
        (select count(*) from eval_scripts e join exam_papers p on p.id = e.paper_id where p.session_id = s.id and e.status <> 'finalised') as scripts_open,
        (select count(*) from exam_moderations m where m.session_id = s.id and m.status in ('proposed', 'approved')) as moderations_open,
        (select count(*) from revaluation_requests v where v.session_id = s.id and v.status in ('requested', 'accepted')) as revaluations_open
        from exam_sessions s where s.id = ${id}::uuid`,
    );
    const n = (k: string) => Number(r[k] ?? 0);
    return {
      name: String(r.name), kind: String(r.kind), papers: n('papers'), hasWindow: !!r.has_window, registrations: n('registrations'), feeDues: n('fee_dues'), feeOpen: n('fee_open'), tickets: n('tickets'),
      papersHeld: n('papers_held'), papersWithAttendance: n('papers_with_attendance'), scripts: n('scripts'), scriptsOpen: n('scripts_open'), moderationsOpen: n('moderations_open'),
      status: r.status as StageFacts['status'], approvalRequired: !!r.approval_required, approved: !!r.approved_at, revaluationsOpen: n('revaluations_open'),
      approvalRequestedBy: (r.approval_requested_by as string | null) ?? null, approvalRequestedAt: (r.approval_requested_at as Date | null) ?? null,
    };
  }

  private async stageRows(tx: Tx, id: string): Promise<StageRow[]> {
    return this.q<StageRow>(tx, sql`select g.stage, g.status, u.full_name as actor, g.note, g.at from exam_session_stages g left join users u on u.id = g.actor_id where g.session_id = ${id}::uuid`);
  }

  private async sessionRecord(tx: Tx, p: UserPrincipal, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const head = await this.one<Row>(tx, sql`select s.*, pr.name as programme from exam_sessions s join programs pr on pr.id = s.program_id where s.id = ${id}::uuid`);
    const f = await this.facts(tx, id);
    const rows = await this.stageRows(tx, id);
    const states = stageStates(rows, f);
    const cur = currentStage(rows, f);
    const curRow = states.find((x) => x.stage === cur);
    const approver = p.roles.some((r) => APPROVERS.has(r));
    let approval: RecordView['approval'] = null;
    if (cur === 'timetable' && curRow?.pending) approval = { key: 'timetable', canDecide: approver && (await this.stageActor(tx, id, 'timetable')) !== p.userId };
    if (cur === 'result_approval' && f.approvalRequired && f.approvalRequestedAt && !f.approved) approval = { key: 'result_approval', canDecide: p.roles.some((r) => r === 'principal' || r === 'tenant_admin') && f.approvalRequestedBy !== p.userId };
    const actions: RecordAction[] = [];
    if (cur && !APPROVAL_STAGES.includes(cur) && cur !== 'published') actions.push({ key: 'complete', tone: 'primary', input: 'comment', blocked: stageBlocker(cur, f) ?? undefined });
    if (cur === 'timetable' && !curRow?.pending) actions.push({ key: 'submit_timetable', tone: 'primary', blocked: stageBlocker('timetable', f) ?? undefined });
    if (f.registrations > f.feeDues && (cur === 'fees' || f.feeDues === 0)) actions.push({ key: 'raise_fees', tone: cur === 'fees' ? 'primary' : 'outline' });
    if (cur === 'result_approval') {
      if (f.status === 'processed' && f.approvalRequired && !f.approvalRequestedAt) actions.push({ key: 'request_result_approval', tone: 'primary' });
      if (!f.approvalRequired || f.approved) actions.push({ key: 'complete', tone: 'primary', input: 'comment', blocked: stageBlocker('result_approval', f) ?? undefined });
    }
    if (cur === 'published') actions.push({ key: 'publish', tone: 'primary', blocked: f.status === 'processed' && (!f.approvalRequired || f.approved) ? undefined : stageBlocker('result_approval', f) ?? 'Process the results first' });
    const papers = await this.q(tx, sql`select p.id as _id, 'paper' as _kind, sub.name as subject, sec.display_name as class, p.exam_date as date, to_char(p.starts_at, 'HH24:MI') || '–' || to_char(p.ends_at, 'HH24:MI') as time, p.max_marks as max_marks,
      (select count(*) from exam_attendance a where a.paper_id = p.id and a.status = 'present') as present, (select count(*) from exam_attendance a where a.paper_id = p.id and a.status <> 'present') as absent
      from exam_papers p join subjects sub on sub.id = p.subject_id join sections sec on sec.id = p.section_id where p.session_id = ${id}::uuid order by p.exam_date, p.starts_at`);
    const regs = await this.q(tx, sql`select r.session_id || '_' || r.student_id as _id, 'registration' as _kind, st.roll_no, st.full_name as student, r.status, coalesce(f.status, '—') as fee from exam_registrations r join students st on st.id = r.student_id left join exam_fee_dues f on f.session_id = r.session_id and f.student_id = r.student_id where r.session_id = ${id}::uuid order by st.roll_no`);
    const tickets = await this.q(tx, sql`select h.session_id || '_' || h.student_id as _id, 'hall_ticket' as _kind, h.ticket_no, st.full_name as student, case when h.blocked then 'blocked' else 'issued' end as status, h.blocked_reason as reason from hall_tickets h join students st on st.id = h.student_id where h.session_id = ${id}::uuid order by h.ticket_no`);
    const qps = await this.q(tx, sql`select q.id as _id, 'question_paper' as _kind, q.code, q.title, sub.name as subject, q.status from ext_question_papers q join subjects sub on sub.id = q.subject_id where q.session_id = ${id}::uuid order by sub.name`);
    const mods = await this.q(tx, sql`select m.paper_id as _id, 'paper' as _kind, sub.name as subject, m.kind, m.value, m.reason, m.status from exam_moderations m join exam_papers p on p.id = m.paper_id join subjects sub on sub.id = p.subject_id where m.session_id = ${id}::uuid order by m.created_at desc`);
    const results = await this.q(tx, sql`select r.id as _id, 'result' as _kind, st.roll_no, st.full_name as student, r.sgpa, r.cgpa, r.outcome as status from exam_results r join students st on st.id = r.student_id where r.session_id = ${id}::uuid order by st.roll_no`);
    return {
      kind: 'session', id, sessionId: id,
      title: String(head.name), subtitle: String(head.programme),
      status: { key: cur ?? 'done', tone: curRow?.state === 'rejected' ? 'danger' : cur ? (curRow?.pending ? 'warning' : 'info') : 'success' },
      facts: [
        { key: 'programme', value: String(head.programme) }, { key: 'term', value: Number(head.term) }, { key: 'kind', value: String(head.kind), format: 'status' },
        { key: 'starts', value: iso(head.starts_on), format: 'date' }, { key: 'ends', value: iso(head.ends_on), format: 'date' }, { key: 'candidates', value: f.registrations },
      ],
      overview: [
        { key: 'stage', value: cur ?? 'done', format: 'status' }, { key: 'result_status', value: f.status, format: 'status' }, { key: 'papers', value: f.papers }, { key: 'tickets', value: f.tickets },
        { key: 'fees_open', value: f.feeOpen }, { key: 'scripts_open', value: f.scriptsOpen }, { key: 'moderations_open', value: f.moderationsOpen }, { key: 'revaluations_open', value: f.revaluationsOpen },
        ...(cur ? [{ key: 'next_step', value: stageBlocker(cur, f) ?? 'ready' }] : []),
      ],
      steps: states.map((x) => ({ key: x.stage, state: x.state, by: x.row?.actor ?? null, at: iso(x.row?.at), note: x.pending ? 'pending' : (x.row?.note ?? null) })),
      approval,
      actions,
      related: [
        { key: 'papers', columns: [{ key: 'subject' }, { key: 'class' }, { key: 'date', format: 'date' }, { key: 'time' }, { key: 'max_marks' }, { key: 'present' }, { key: 'absent' }], rows: papers },
        { key: 'registrations', columns: [{ key: 'roll_no' }, { key: 'student' }, { key: 'status', format: 'status' }, { key: 'fee', format: 'status' }], rows: regs },
        { key: 'hall_tickets', columns: [{ key: 'ticket_no' }, { key: 'student' }, { key: 'status', format: 'status' }, { key: 'reason' }], rows: tickets },
        { key: 'question_papers', columns: [{ key: 'code' }, { key: 'title' }, { key: 'subject' }, { key: 'status', format: 'status' }], rows: qps },
        { key: 'moderations', columns: [{ key: 'subject' }, { key: 'kind', format: 'status' }, { key: 'value' }, { key: 'reason' }, { key: 'status', format: 'status' }], rows: mods },
        { key: 'results', columns: [{ key: 'roll_no' }, { key: 'student' }, { key: 'sgpa' }, { key: 'cgpa' }, { key: 'status', format: 'status' }], rows: results },
      ],
      documents: f.status === 'published' || f.status === 'locked' ? [{ key: 'consolidated', href: `/api/download?kind=consolidated-result&id=${id}` }] : [],
      activity: await this.activity(tx, sql`a.subject_id = ${id}::uuid`),
    };
  }

  private async stageActor(tx: Tx, sessionId: string, stage: Stage): Promise<string | null> {
    const [r] = await tx.select({ actorId: examSessionStages.actorId }).from(examSessionStages).where(and(eq(examSessionStages.sessionId, sessionId), eq(examSessionStages.stage, stage)));
    return r?.actorId ?? null;
  }

  private async paperRecord(tx: Tx, p: UserPrincipal, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const h = await this.one<Row>(tx, sql`select p.*, sub.name as subject, sub.code, sec.display_name as class, s.name as session, s.status as session_status from exam_papers p join subjects sub on sub.id = p.subject_id join sections sec on sec.id = p.section_id join exam_sessions s on s.id = p.session_id where p.id = ${id}::uuid`);
    const cands = await this.q<Row>(tx, sql`select st.id, st.full_name as name, st.roll_no, r.name as room, es.seat_no, coalesce(a.status, 'unmarked') as status, a.booklet_no,
      (select m.marks from marks m where m.assessment_id = ${h.assessment_id as string | null}::uuid and m.student_id = st.id) as marks,
      (select m.moderated_marks from marks m where m.assessment_id = ${h.assessment_id as string | null}::uuid and m.student_id = st.id) as moderated
      from students st left join exam_seats es on es.paper_id = ${id}::uuid and es.student_id = st.id left join rooms r on r.id = es.room_id left join exam_attendance a on a.paper_id = ${id}::uuid and a.student_id = st.id
      where st.section_id = ${h.section_id as string}::uuid and st.status = 'active' order by st.roll_no`);
    const scripts = await this.q(tx, sql`select e.id as _id, 'script' as _kind, e.dummy_no, e.status, e.final_marks from eval_scripts e where e.paper_id = ${id}::uuid order by e.dummy_no`);
    const mods = await this.q<Row>(tx, sql`select m.id, m.kind, m.value, m.reason, m.status, m.applied_count, m.proposed_by, u.full_name as proposed_by_name, m.decision_note from exam_moderations m join users u on u.id = m.proposed_by where m.paper_id = ${id}::uuid order by m.created_at desc`);
    const open = mods.find((m) => m.status === 'proposed');
    const approved = mods.find((m) => m.status === 'approved');
    const present = cands.filter((c) => c.status === 'present').length;
    const marked = cands.some((c) => c.status !== 'unmarked');
    const actions: RecordAction[] = [{ key: 'attendance', input: 'absentees', tone: marked ? 'outline' : 'primary' }];
    if (!open && !approved) actions.push({ key: 'moderate', input: 'moderation', tone: 'outline', blocked: h.assessment_id ? undefined : 'This paper has no marks yet' });
    if (approved) actions.push({ key: 'apply_moderation', tone: 'primary' });
    return {
      kind: 'paper', id, sessionId: String(h.session_id),
      title: `${h.subject}`, subtitle: `${h.class} · ${h.session}`,
      status: { key: marked ? 'done' : String(h.session_status), tone: marked ? 'success' : tone(String(h.session_status)) },
      facts: [
        { key: 'code', value: String(h.code) }, { key: 'class', value: String(h.class) }, { key: 'date', value: iso(h.exam_date), format: 'date' },
        { key: 'time', value: `${String(h.starts_at).slice(0, 5)}–${String(h.ends_at).slice(0, 5)}` }, { key: 'max_marks', value: num(h.max_marks) }, { key: 'present', value: marked ? `${present} / ${cands.length}` : '—' },
      ],
      overview: [{ key: 'session', value: String(h.session) }, { key: 'candidates', value: cands.length }, { key: 'absent', value: cands.filter((c) => c.status === 'absent').length }, { key: 'debarred', value: cands.filter((c) => c.status === 'debarred').length }, { key: 'scripts', value: scripts.length }],
      steps: null,
      approval: open ? { key: 'moderation', canDecide: p.roles.some((r) => APPROVERS.has(r)) && open.proposed_by !== p.userId } : null,
      actions,
      related: [
        { key: 'candidates', columns: [{ key: 'roll_no' }, { key: 'name' }, { key: 'room' }, { key: 'seat_no' }, { key: 'status', format: 'status' }, { key: 'marks' }, { key: 'moderated' }], rows: cands.map(({ id: _x, ...r }) => r) },
        { key: 'scripts', columns: [{ key: 'dummy_no' }, { key: 'status', format: 'status' }, { key: 'final_marks' }], rows: scripts },
        { key: 'moderations', columns: [{ key: 'kind', format: 'status' }, { key: 'value' }, { key: 'reason' }, { key: 'proposed_by_name' }, { key: 'status', format: 'status' }, { key: 'applied_count' }], rows: mods.map(({ id: _x, proposed_by: _y, ...r }) => r) },
      ],
      documents: [],
      activity: await this.activity(tx, sql`a.subject_id = ${id}::uuid or (a.subject_type = 'exam_moderation' and a.data->>'paperId' = ${id})`),
      candidates: cands.map((c) => ({ id: String(c.id), name: String(c.name), rollNo: String(c.roll_no), status: String(c.status) })),
    };
  }

  private async registrationRecord(tx: Tx, id: string): Promise<RecordView> {
    const [sid, stid] = pair(id);
    const r = await this.one<Row>(tx, sql`select r.*, st.full_name, st.roll_no, sec.display_name as class, s.name as session, f.status as fee_status, f.amount_paise, f.receipt_no, f.papers as fee_papers, h.ticket_no, h.blocked, u.full_name as overridden_by_name
      from exam_registrations r join students st on st.id = r.student_id join sections sec on sec.id = st.section_id join exam_sessions s on s.id = r.session_id
      left join exam_fee_dues f on f.session_id = r.session_id and f.student_id = r.student_id left join hall_tickets h on h.session_id = r.session_id and h.student_id = r.student_id left join users u on u.id = r.overridden_by
      where r.session_id = ${sid}::uuid and r.student_id = ${stid}::uuid`);
    const papers = await this.q(tx, sql`select p.id as _id, 'paper' as _kind, sub.name as subject, p.exam_date as date, to_char(p.starts_at, 'HH24:MI') as time, coalesce(a.status, 'unmarked') as attendance
      from exam_papers p join subjects sub on sub.id = p.subject_id left join exam_attendance a on a.paper_id = p.id and a.student_id = ${stid}::uuid where p.session_id = ${sid}::uuid and p.section_id = (select section_id from students where id = ${stid}::uuid) order by p.exam_date`);
    const actions: RecordAction[] = [];
    if (r.status === 'ineligible') actions.push({ key: 'override', input: 'comment', tone: 'primary' });
    if (r.fee_status === 'due') actions.push({ key: 'fee_paid', input: 'receipt', tone: 'primary' }, { key: 'fee_waive', input: 'comment', tone: 'outline' });
    return {
      kind: 'registration', id, sessionId: sid,
      title: String(r.full_name), subtitle: String(r.session),
      status: { key: String(r.status), tone: tone(String(r.status)) },
      facts: [
        { key: 'roll_no', value: String(r.roll_no) }, { key: 'class', value: String(r.class) }, { key: 'registered_at', value: iso(r.registered_at), format: 'date' },
        { key: 'fee', value: r.fee_status ? String(r.fee_status) : 'not_raised', format: 'status' }, { key: 'amount', value: num(r.amount_paise), format: 'money' }, { key: 'ticket_no', value: (r.ticket_no as string) ?? '—' },
      ],
      overview: [
        { key: 'reasons', value: ((r.reasons as string[]) ?? []).join('; ') || '—' }, { key: 'override_reason', value: (r.override_reason as string) ?? '—' }, { key: 'overridden_by', value: (r.overridden_by_name as string) ?? '—' },
        { key: 'receipt_no', value: (r.receipt_no as string) ?? '—' }, { key: 'papers', value: papers.length },
      ],
      steps: [
        { key: 'registration', state: r.status === 'registered' ? 'done' : 'rejected', by: null, at: iso(r.registered_at), note: null },
        { key: 'fees', state: r.fee_status === 'paid' || r.fee_status === 'waived' ? 'done' : r.status === 'registered' ? 'current' : 'upcoming', by: null, at: null, note: (r.fee_status as string) ?? null },
        { key: 'hall_tickets', state: r.ticket_no && !r.blocked ? 'done' : r.ticket_no ? 'rejected' : 'upcoming', by: null, at: null, note: null },
      ],
      approval: null,
      actions,
      related: [{ key: 'papers', columns: [{ key: 'subject' }, { key: 'date', format: 'date' }, { key: 'time' }, { key: 'attendance', format: 'status' }], rows: papers }],
      documents: [],
      activity: await this.activity(tx, sql`a.subject_id = ${stid}::uuid and a.subject_type in ('exam_registration', 'exam_fee') and a.data->>'sessionId' = ${sid}`),
    };
  }

  private async ticketRecord(tx: Tx, id: string): Promise<RecordView> {
    const [sid, stid] = pair(id);
    const h = await this.one<Row>(tx, sql`select h.*, st.full_name, st.roll_no, sec.display_name as class, s.name as session from hall_tickets h join students st on st.id = h.student_id join sections sec on sec.id = st.section_id join exam_sessions s on s.id = h.session_id where h.session_id = ${sid}::uuid and h.student_id = ${stid}::uuid`);
    const seats = await this.q(tx, sql`select p.id as _id, 'paper' as _kind, sub.name as subject, p.exam_date as date, to_char(p.starts_at, 'HH24:MI') as time, r.name as room, es.seat_no
      from exam_papers p join subjects sub on sub.id = p.subject_id left join exam_seats es on es.paper_id = p.id and es.student_id = ${stid}::uuid left join rooms r on r.id = es.room_id
      where p.session_id = ${sid}::uuid and p.section_id = (select section_id from students where id = ${stid}::uuid) order by p.exam_date`);
    return {
      kind: 'hall_ticket', id, sessionId: sid,
      title: String(h.ticket_no), subtitle: `${h.full_name} · ${h.session}`,
      status: { key: h.blocked ? 'blocked' : 'issued', tone: h.blocked ? 'danger' : 'success' },
      facts: [{ key: 'student', value: String(h.full_name) }, { key: 'roll_no', value: String(h.roll_no) }, { key: 'class', value: String(h.class) }, { key: 'issued_at', value: iso(h.issued_at), format: 'date' }, { key: 'papers', value: seats.length }],
      overview: [{ key: 'session', value: String(h.session) }, { key: 'reason', value: (h.blocked_reason as string) ?? '—' }],
      steps: null,
      approval: null,
      actions: h.blocked ? [{ key: 'unblock', tone: 'primary', input: 'comment' }] : [{ key: 'block', tone: 'danger', input: 'comment' }],
      related: [{ key: 'seats', columns: [{ key: 'subject' }, { key: 'date', format: 'date' }, { key: 'time' }, { key: 'room' }, { key: 'seat_no' }], rows: seats }],
      documents: h.blocked ? [] : [{ key: 'hall_ticket', href: `/api/download?kind=exam-hall-ticket&id=${sid}&student=${stid}` }],
      activity: await this.activity(tx, sql`a.subject_id = ${stid}::uuid and a.subject_type = 'hall_ticket' and a.data->>'sessionId' = ${sid}`),
    };
  }

  private async qpRecord(tx: Tx, p: UserPrincipal, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const q = await this.one<Row>(tx, sql`select q.*, sub.name as subject, sub.code as subject_code, s.name as session, su.full_name as setter, au.full_name as approver, ru.full_name as releaser
      from ext_question_papers q join subjects sub on sub.id = q.subject_id join exam_sessions s on s.id = q.session_id
      left join ext_examiner_assignments a on a.id = q.setter_assignment_id left join ext_examiners x on x.id = a.examiner_id left join users su on su.id = x.user_id
      left join users au on au.id = q.approved_by left join users ru on ru.id = q.released_by where q.id = ${id}::uuid`);
    const status = String(q.status);
    const at = QP_FLOW.indexOf(status as (typeof QP_FLOW)[number]);
    const sealed = status === 'locked';
    const releaseAt = q.release_at ? new Date(q.release_at as string) : null;
    const actions: RecordAction[] = [];
    if (status === 'draft') actions.push({ key: 'submit_qp', tone: 'primary', blocked: String(q.content).trim() ? undefined : 'The paper has no questions yet' });
    if (status === 'approved') actions.push({ key: 'lock', tone: 'primary', input: 'datetime' });
    if (status === 'locked') actions.push({ key: 'release', tone: 'primary', input: 'comment', blocked: releaseAt && releaseAt.getTime() > Date.now() ? `Sealed until ${releaseAt.toISOString()}` : undefined });
    return {
      kind: 'question_paper', id, sessionId: String(q.session_id),
      title: String(q.title), subtitle: `${q.subject} · ${q.session}`,
      status: { key: status, tone: tone(status) },
      facts: [
        { key: 'code', value: (q.code as string) ?? '—' }, { key: 'subject', value: `${q.subject_code} ${q.subject}` }, { key: 'setter', value: (q.setter as string) ?? '—' },
        { key: 'version', value: Number(q.version) }, { key: 'release_at', value: iso(q.release_at), format: 'datetime' }, { key: 'released_at', value: iso(q.released_at), format: 'datetime' },
      ],
      overview: [
        { key: 'content', value: sealed ? 'sealed' : String(q.content || '—') }, { key: 'content_hash', value: (q.content_hash as string) ?? '—' },
        { key: 'scrutiny_note', value: (q.scrutiny_note as string) ?? '—' }, { key: 'approver', value: (q.approver as string) ?? '—' }, { key: 'releaser', value: (q.releaser as string) ?? '—' },
      ],
      steps: QP_FLOW.map((k, i) => ({ key: `qp_${k}`, state: i < at || (i === at && status === 'released') ? 'done' : i === at ? 'current' : 'upcoming', by: null, at: k === 'released' ? iso(q.released_at) : k === 'locked' ? iso(q.locked_at) : k === 'approved' ? iso(q.approved_at) : k === 'scrutiny' ? iso(q.submitted_at) : null, note: null })),
      approval: status === 'scrutiny' ? { key: 'question_paper', canDecide: p.roles.some((r) => APPROVERS.has(r)) } : null,
      actions,
      related: [],
      documents: [],
      activity: await this.activity(tx, sql`a.subject_id = ${id}::uuid`),
    };
  }

  private async scriptRecord(tx: Tx, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const e = await this.one<Row>(tx, sql`select e.*, sub.name as subject, s.name as session, p.max_marks, p.session_id, st.roll_no from eval_scripts e join exam_papers p on p.id = e.paper_id join subjects sub on sub.id = p.subject_id join exam_sessions s on s.id = p.session_id join students st on st.id = e.student_id where e.id = ${id}::uuid`);
    const vals = await this.q(tx, sql`select a.round, u.full_name as examiner, a.status, a.total, a.submitted_at from eval_allocations a join users u on u.id = a.examiner_id where a.script_id = ${id}::uuid order by a.round`);
    const status = String(e.status);
    return {
      kind: 'script', id, sessionId: String(e.session_id),
      title: String(e.dummy_no), subtitle: `${e.subject} · ${e.session}`,
      status: { key: status, tone: tone(status) },
      facts: [
        { key: 'subject', value: String(e.subject) }, { key: 'roll_no', value: String(e.roll_no) }, { key: 'max_marks', value: num(e.max_marks) }, { key: 'final_marks', value: num(e.final_marks) },
        { key: 'second_valuation', value: e.second_required ? 'yes' : 'no', format: 'status' }, { key: 'third_valuation', value: e.third_required ? 'yes' : 'no', format: 'status' },
      ],
      overview: [{ key: 'pages', value: Array.isArray(e.files) ? e.files.length : 0 }, { key: 'header_masked', value: e.header_masked ? 'yes' : 'no', format: 'status' }],
      steps: ['uploaded', 'allocated', 'valued', 'finalised'].map((k, i, all) => {
        const idx = Math.max(0, all.indexOf(status === 'needs_third' ? 'valued' : status));
        return { key: `script_${k}`, state: i < idx || (i === idx && status === 'finalised') ? ('done' as const) : i === idx ? ('current' as const) : ('upcoming' as const), by: null, at: null, note: null };
      }),
      approval: null,
      actions: [],
      related: [{ key: 'valuations', columns: [{ key: 'round' }, { key: 'examiner' }, { key: 'status', format: 'status' }, { key: 'total' }, { key: 'submitted_at', format: 'datetime' }], rows: vals }],
      documents: [],
      activity: await this.activity(tx, sql`a.subject_id = ${id}::uuid`),
    };
  }

  private async examinerRecord(tx: Tx, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const x = await this.one<Row>(tx, sql`select x.*, u.full_name, u.phone, u.email from ext_examiners x join users u on u.id = x.user_id where x.id = ${id}::uuid`);
    const asg = await this.q<Row>(tx, sql`select a.id, s.name as session, sub.name as subject, a.role, a.status, a.rate_paise, (select count(*) from ext_valuation_scripts v where v.assignment_id = a.id and v.status <> 'pending') as valued, (select count(*) from ext_valuation_scripts v where v.assignment_id = a.id) as scripts
      from ext_examiner_assignments a join exam_sessions s on s.id = a.session_id join subjects sub on sub.id = a.subject_id where a.examiner_id = ${id}::uuid order by a.created_at`);
    const claims = await this.q<Row>(tx, sql`select c.units, c.amount_paise, c.status, c.created_at from ext_remuneration_claims c where c.examiner_id = ${id}::uuid order by c.created_at desc`);
    const active = asg.some((a) => a.status === 'active');
    return {
      kind: 'examiner', id,
      title: String(x.full_name), subtitle: String(x.organisation || '—'),
      status: { key: active ? 'active' : 'invited', tone: active ? 'success' : 'neutral' },
      facts: [
        { key: 'organisation', value: String(x.organisation || '—') }, { key: 'phone', value: (x.phone as string) ?? '—' }, { key: 'assignments', value: asg.length },
        { key: 'scripts_valued', value: asg.reduce((a, r) => a + Number(r.valued), 0) }, { key: 'claims', value: claims.reduce((a, r) => a + Number(r.amount_paise), 0), format: 'money' },
      ],
      overview: [{ key: 'email', value: (x.email as string) ?? '—' }, { key: 'since', value: iso(x.created_at), format: 'date' }],
      steps: null,
      approval: null,
      actions: [],
      related: [
        { key: 'assignments', columns: [{ key: 'session' }, { key: 'subject' }, { key: 'role', format: 'status' }, { key: 'status', format: 'status' }, { key: 'rate_paise', format: 'money' }, { key: 'scripts' }, { key: 'valued' }], rows: asg.map(({ id: _x, ...r }) => r) },
        { key: 'claims', columns: [{ key: 'units' }, { key: 'amount_paise', format: 'money' }, { key: 'status', format: 'status' }, { key: 'created_at', format: 'date' }], rows: claims },
      ],
      documents: [],
      activity: await this.activity(tx, sql`a.subject_id = ${id}::uuid or a.subject_id in (select id from ext_examiner_assignments where examiner_id = ${id}::uuid)`),
    };
  }

  private async resultRecord(tx: Tx, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const r = await this.one<Row>(tx, sql`select r.*, st.full_name, st.roll_no, s.name as session, s.status as session_status from exam_results r join students st on st.id = r.student_id join exam_sessions s on s.id = r.session_id where r.id = ${id}::uuid`);
    const lines = await this.q(tx, sql`select sub.code, sub.name as subject, l.credits, l.percent, l.grade, l.grade_point, case when l.passed then 'pass' else 'fail' end as result from exam_result_lines l join subjects sub on sub.id = l.subject_id where l.result_id = ${id}::uuid order by sub.code`);
    const grace = await this.q(tx, sql`select sub.name as subject, g.marks, u.full_name as applied_by, g.applied_at from grace_awards g join subjects sub on sub.id = g.subject_id join users u on u.id = g.applied_by where g.session_id = ${r.session_id as string}::uuid and g.student_id = ${r.student_id as string}::uuid`);
    const revals = await this.q(tx, sql`select v.id as _id, 'revaluation' as _kind, sub.name as subject, v.kind, v.status::text as status, v.previous_percent, v.new_percent from revaluation_requests v join subjects sub on sub.id = v.subject_id where v.session_id = ${r.session_id as string}::uuid and v.student_id = ${r.student_id as string}::uuid`);
    return {
      kind: 'result', id, sessionId: String(r.session_id),
      title: String(r.full_name), subtitle: String(r.session),
      status: { key: String(r.outcome), tone: tone(String(r.outcome)) },
      facts: [
        { key: 'roll_no', value: String(r.roll_no) }, { key: 'sgpa', value: num(r.sgpa) }, { key: 'cgpa', value: num(r.cgpa) },
        { key: 'credits', value: `${num(r.credits_earned)} / ${num(r.credits_attempted)}` }, { key: 'result_status', value: String(r.session_status), format: 'status' }, { key: 'computed_at', value: iso(r.computed_at), format: 'date' },
      ],
      overview: [{ key: 'credit_points', value: num(r.credit_points) }, { key: 'subjects', value: lines.length }, { key: 'grace', value: grace.length }],
      steps: null,
      approval: null,
      actions: [],
      related: [
        { key: 'subjects', columns: [{ key: 'code' }, { key: 'subject' }, { key: 'credits' }, { key: 'percent', format: 'percent' }, { key: 'grade' }, { key: 'grade_point' }, { key: 'result', format: 'status' }], rows: lines },
        { key: 'grace', columns: [{ key: 'subject' }, { key: 'marks' }, { key: 'applied_by' }, { key: 'applied_at', format: 'date' }], rows: grace },
        { key: 'revaluations', columns: [{ key: 'subject' }, { key: 'kind', format: 'status' }, { key: 'status', format: 'status' }, { key: 'previous_percent', format: 'percent' }, { key: 'new_percent', format: 'percent' }], rows: revals },
      ],
      documents: [{ key: 'progress_report', href: `/api/download?kind=progress-report&id=${r.student_id}` }],
      activity: await this.activity(tx, sql`a.subject_id = ${r.session_id as string}::uuid and a.action like 'exam.results.%'`),
    };
  }

  private async revaluationRecord(tx: Tx, p: UserPrincipal, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const v = await this.one<Row>(tx, sql`select v.*, v.status::text as st, st.full_name, st.roll_no, sub.name as subject, s.name as session, d.full_name as decided_by_name from revaluation_requests v join students st on st.id = v.student_id join subjects sub on sub.id = v.subject_id join exam_sessions s on s.id = v.session_id left join users d on d.id = v.decided_by where v.id = ${id}::uuid`);
    const status = String(v.st);
    const flow = ['requested', 'accepted', 'completed'];
    const idx = status === 'rejected' ? 1 : flow.indexOf(status);
    return {
      kind: 'revaluation', id, sessionId: String(v.session_id),
      title: `${v.full_name} · ${v.subject}`, subtitle: String(v.session),
      status: { key: status, tone: tone(status) },
      facts: [
        { key: 'kind', value: String(v.kind), format: 'status' }, { key: 'roll_no', value: String(v.roll_no) }, { key: 'fee', value: num(v.fee_paise), format: 'money' },
        { key: 'previous_percent', value: num(v.previous_percent), format: 'percent' }, { key: 'new_percent', value: num(v.new_percent), format: 'percent' }, { key: 'requested_at', value: iso(v.created_at), format: 'date' },
      ],
      overview: [{ key: 'reason', value: (v.reason as string) ?? '—' }, { key: 'decision_note', value: (v.decision_note as string) ?? '—' }, { key: 'decided_by', value: (v.decided_by_name as string) ?? '—' }],
      steps: flow.map((k, i) => ({ key: `reval_${k}`, state: status === 'rejected' && i === 1 ? ('rejected' as const) : i < idx || (i === idx && status === 'completed') ? ('done' as const) : i === idx ? ('current' as const) : ('upcoming' as const), by: i === 1 ? ((v.decided_by_name as string) ?? null) : null, at: i === 0 ? iso(v.created_at) : i === 1 ? iso(v.decided_at) : null, note: i === 1 ? ((v.decision_note as string) ?? null) : null })),
      approval: status === 'requested' ? { key: 'revaluation', canDecide: p.roles.some((r) => APPROVERS.has(r)) } : null,
      actions: status === 'accepted' ? [{ key: 'complete_revaluation', input: 'marks', tone: 'primary' }] : [],
      related: [],
      documents: [],
      activity: await this.activity(tx, sql`a.subject_id = ${id}::uuid`),
    };
  }

  private async certificateRecord(tx: Tx, p: UserPrincipal, id: string): Promise<RecordView> {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const d = await this.one<Row>(tx, sql`select d.*, st.full_name, st.roll_no, sec.display_name as class, u.full_name as decided_by_name from academic_doc_requests d join students st on st.id = d.student_id join sections sec on sec.id = st.section_id left join users u on u.id = d.decided_by where d.id = ${id}::uuid`);
    const status = String(d.status);
    const flow = ['requested', 'approved', 'issued'];
    const idx = status === 'rejected' ? 1 : flow.indexOf(status);
    return {
      kind: 'certificate', id,
      title: `${d.full_name}`, subtitle: String(d.kind),
      status: { key: status, tone: tone(status) },
      facts: [
        { key: 'doc_kind', value: String(d.kind), format: 'status' }, { key: 'roll_no', value: String(d.roll_no) }, { key: 'class', value: String(d.class) },
        { key: 'serial_no', value: (d.serial_no as string) ?? '—' }, { key: 'requested_at', value: iso(d.created_at), format: 'date' }, { key: 'issued_at', value: iso(d.issued_at), format: 'date' },
      ],
      overview: [{ key: 'purpose', value: String(d.purpose || '—') }, { key: 'decision_note', value: (d.decision_note as string) ?? '—' }, { key: 'decided_by', value: (d.decided_by_name as string) ?? '—' }],
      steps: flow.map((k, i) => ({ key: `cert_${k}`, state: status === 'rejected' && i === 1 ? ('rejected' as const) : i < idx || (i === idx && status === 'issued') ? ('done' as const) : i === idx ? ('current' as const) : ('upcoming' as const), by: i === 1 ? ((d.decided_by_name as string) ?? null) : null, at: i === 0 ? iso(d.created_at) : i === 1 ? iso(d.decided_at) : iso(d.issued_at), note: null })),
      approval: status === 'requested' ? { key: 'certificate', canDecide: p.roles.some((r) => APPROVERS.has(r)) } : null,
      actions: status === 'approved' ? [{ key: 'issue', tone: 'primary' }] : [],
      related: [],
      documents: status === 'issued' ? [{ key: 'certificate', href: `/api/download?kind=academic-doc&id=${id}` }] : [],
      activity: await this.activity(tx, sql`a.subject_id = ${id}::uuid`),
    };
  }

  // ---- actions --------------------------------------------------------------------------------

  act(p: UserPrincipal, kind: Kind, id: string, action: string, b: { comment?: string; value?: unknown }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const note = b.comment?.trim() || null;
      if (kind === 'session') return this.sessionAction(tx, p, id, action, note);
      if (kind === 'paper') return this.paperAction(tx, p, id, action, note, b.value);
      if (kind === 'registration') return this.registrationAction(tx, p, id, action, note, b.value);
      if (kind === 'hall_ticket') return this.ticketAction(tx, p, id, action, note);
      if (kind === 'question_paper') return this.qpAction(tx, p, id, action, note, b.value);
      throw new BadRequestException('This record has no such action');
    });
  }

  private async setStage(tx: Tx, p: UserPrincipal, sessionId: string, stage: Stage, status: 'done' | 'pending' | 'rejected', note: string | null) {
    await tx
      .insert(examSessionStages)
      .values({ tenantId: p.tenantId, sessionId, stage, status, actorId: p.userId, note, at: new Date() })
      .onConflictDoUpdate({ target: [examSessionStages.sessionId, examSessionStages.stage], set: { status, actorId: p.userId, note, at: new Date() } });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `exam.stage.${stage}.${status}`, subjectType: 'exam_session', subjectId: sessionId, data: { stage, note } });
  }

  private async sessionStudents(tx: Tx, sessionId: string): Promise<string[]> {
    return (await this.q<{ id: string }>(tx, sql`select distinct st.id from students st join exam_papers p on p.section_id = st.section_id where p.session_id = ${sessionId}::uuid and st.status = 'active'`)).map((r) => r.id);
  }

  private async sessionAction(tx: Tx, p: UserPrincipal, id: string, action: string, note: string | null) {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const f = await this.facts(tx, id);
    const rows = await this.stageRows(tx, id);
    const cur = currentStage(rows, f);
    const curRow = rows.find((r) => r.stage === cur);
    switch (action) {
      case 'complete': {
        if (!cur || cur === 'published' || cur === 'timetable') throw new ConflictException('This step closes through its own action');
        if (cur === 'result_approval' && f.approvalRequired && !f.approved) throw new ConflictException('The results are waiting for approval');
        const blocker = stageBlocker(cur, f);
        if (blocker) throw new ConflictException(blocker);
        await this.setStage(tx, p, id, cur, 'done', note);
        return { stage: cur, status: 'done' };
      }
      case 'submit_timetable': {
        if (cur !== 'timetable') throw new ConflictException('The timetable is not the current step');
        if (curRow?.status === 'pending') throw new ConflictException('The timetable is already waiting for approval');
        const blocker = stageBlocker('timetable', f);
        if (blocker) throw new ConflictException(blocker);
        await this.setStage(tx, p, id, 'timetable', 'pending', note);
        await this.tasks.createForRole(tx, p.tenantId, ['principal', 'exam_controller'], { ownerId: p.userId, title: `Approve exam timetable: ${f.name}`, description: 'Check the dates, slots and clashes, then approve or return the timetable.', sourceModule: 'exam_office', sourceId: id, priority: 'high', slaHours: 48, escalateRole: 'tenant_admin' });
        return { stage: 'timetable', status: 'pending' };
      }
      case 'approve':
      case 'reject': {
        if (cur !== 'timetable' || curRow?.status !== 'pending') throw new ConflictException('There is nothing waiting for approval');
        if (!p.roles.some((r) => APPROVERS.has(r))) throw new ForbiddenException('Only the principal or the controller of examinations can approve the timetable');
        if ((await this.stageActor(tx, id, 'timetable')) === p.userId) throw new ForbiddenException('The timetable must be approved by someone other than the person who submitted it');
        if (action === 'reject' && !note) throw new BadRequestException('Say why the timetable is returned');
        await this.setStage(tx, p, id, 'timetable', action === 'approve' ? 'done' : 'rejected', note);
        if (action === 'approve') {
          await tx.update(examSessions).set({ status: 'scheduled' }).where(and(eq(examSessions.id, id), eq(examSessions.status, 'draft')));
          await this.notes.examNotice(tx, await this.sessionStudents(tx, id), {
            kind: 'calendar',
            text: {
              en: { title: 'Exam timetable published', body: `The timetable for ${f.name} is out. Check your papers and dates.` },
              hi: { title: 'परीक्षा समय-सारणी जारी', body: `${f.name} की समय-सारणी जारी हो गई है। अपने प्रश्नपत्र और तिथियाँ देखें।` },
              kn: { title: 'ಪರೀಕ್ಷಾ ವೇಳಾಪಟ್ಟಿ ಪ್ರಕಟ', body: `${f.name} ವೇಳಾಪಟ್ಟಿ ಪ್ರಕಟವಾಗಿದೆ. ನಿಮ್ಮ ಪತ್ರಿಕೆಗಳು ಮತ್ತು ದಿನಾಂಕಗಳನ್ನು ನೋಡಿ.` },
            },
            data: { sessionId: id },
            dedupeKey: `exam-timetable:${id}`,
          });
        }
        return { stage: 'timetable', status: action === 'approve' ? 'done' : 'rejected' };
      }
      case 'raise_fees':
        return this.raiseFees(tx, p, id, ['supplementary', 'improvement', 'special'].includes(f.kind), f.name);
      default:
        throw new BadRequestException('Unknown action');
    }
  }

  /** Raises the exam fee for every registered candidate who has none yet (papers × rate, at least the minimum). */
  private async raiseFees(tx: Tx, p: UserPrincipal, id: string, supplementary: boolean, name: string) {
    const cfg = (await officeSettings(tx)).settings;
    const slabs = (await cellSettings(tx)).lateFeeSlabs;
    const regs = await this.q<{ student_id: string; papers: number; days_late: number }>(
      tx,
      sql`select r.student_id, (select count(*) from exam_papers p where p.session_id = r.session_id and p.section_id = st.section_id)::int as papers,
        coalesce((r.registered_at at time zone 'Asia/Kolkata')::date - (select w.closes_on from exam_registration_windows w where w.session_id = r.session_id), 0)::int as days_late
        from exam_registrations r join students st on st.id = r.student_id where r.session_id = ${id}::uuid and r.status = 'registered'
        and not exists (select 1 from exam_fee_dues f where f.session_id = r.session_id and f.student_id = r.student_id)`,
    );
    if (regs.length === 0) throw new ConflictException('Every registered candidate already has an exam fee');
    // Late registrants pay the late fee: the office's one late fee, or the slab (super-fine) their lateness reaches.
    // Each fee is an invoice on the candidate's fee account (paid at the counter, online or in the apps).
    for (const r of regs) {
      const late = lateFeeFor(slabs, r.days_late, cfg.examFees.lateFeePaise);
      await chargeExamFee(tx, p, { sessionId: id, studentId: r.student_id, sessionName: name, papers: r.papers, amountPaise: examFee(cfg.examFees, r.papers, supplementary, false) + late.amountPaise, note: late.slab ? `Includes ${late.slab}` : late.amountPaise ? 'Includes the late fee' : null, now: new Date() });
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.fees.raised', subjectType: 'exam_session', subjectId: id, data: { candidates: regs.length } });
    await this.notes.examNotice(tx, regs.map((r) => r.student_id), {
      kind: 'fee',
      text: {
        en: { title: 'Exam fee due', body: `Pay the examination fee for ${name} to get your hall ticket.` },
        hi: { title: 'परीक्षा शुल्क देय', body: `प्रवेश पत्र पाने के लिए ${name} का परीक्षा शुल्क जमा करें।` },
        kn: { title: 'ಪರೀಕ್ಷಾ ಶುಲ್ಕ ಬಾಕಿ', body: `ಪ್ರವೇಶ ಪತ್ರ ಪಡೆಯಲು ${name} ಪರೀಕ್ಷಾ ಶುಲ್ಕ ಪಾವತಿಸಿ.` },
      },
      data: { sessionId: id },
      dedupeKey: `exam-fee:${id}`,
    });
    return { raised: regs.length };
  }

  private async paperAction(tx: Tx, p: UserPrincipal, id: string, action: string, note: string | null, value: unknown) {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const [paper] = await tx.select().from(examPapers).where(eq(examPapers.id, id));
    if (!paper) throw new NotFoundException('Paper not found');
    const v = (value ?? {}) as Record<string, unknown>;
    if (action === 'attendance') {
      const absent = new Set(Array.isArray(v.absent) ? v.absent.filter((x): x is string => typeof x === 'string') : []);
      const debarred = new Set(Array.isArray(v.debarred) ? v.debarred.filter((x): x is string => typeof x === 'string') : []);
      const roster = await this.q<{ id: string }>(tx, sql`select id from students where section_id = ${paper.sectionId}::uuid and status = 'active'`);
      const ids = new Set(roster.map((r) => r.id));
      for (const x of [...absent, ...debarred]) if (!ids.has(x)) throw new BadRequestException('A candidate is not on this paper');
      for (const r of roster) {
        const status = debarred.has(r.id) ? 'debarred' : absent.has(r.id) ? 'absent' : 'present';
        await tx.insert(examAttendance).values({ tenantId: p.tenantId, paperId: id, studentId: r.id, status, markedBy: p.userId }).onConflictDoUpdate({ target: [examAttendance.paperId, examAttendance.studentId], set: { status, markedBy: p.userId, markedAt: new Date() } });
        // An absentee with no marks yet is recorded absent in the marks book too.
        if (status !== 'present' && paper.assessmentId) await tx.insert(marks).values({ tenantId: p.tenantId, assessmentId: paper.assessmentId, studentId: r.id, marks: null, absent: true }).onConflictDoNothing();
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.attendance.marked', subjectType: 'exam_paper', subjectId: id, data: { present: roster.length - absent.size - debarred.size, absent: absent.size, debarred: debarred.size } });
      return { present: roster.length - absent.size - debarred.size, absent: absent.size, debarred: debarred.size };
    }
    const cfg = (await officeSettings(tx)).settings;
    if (action === 'moderate') {
      const kind = v.kind === 'scale' ? 'scale' : v.kind === 'add' ? 'add' : null;
      const amount = Number(v.value);
      if (!kind || !Number.isFinite(amount)) throw new BadRequestException('Choose add marks or scale, and a value');
      if (!note || note.length < 3) throw new BadRequestException('Give the reason for the moderation');
      const problem = moderationProblem(cfg.moderation, kind, amount);
      if (problem) throw new BadRequestException(problem);
      if (!paper.assessmentId) throw new ConflictException('This paper has no marks yet');
      const [open] = await tx.select({ id: examModerations.id }).from(examModerations).where(and(eq(examModerations.paperId, id), inArray(examModerations.status, ['proposed', 'approved'])));
      if (open) throw new ConflictException('A moderation of this paper is already open');
      const [m] = await tx.insert(examModerations).values({ tenantId: p.tenantId, sessionId: paper.sessionId, paperId: id, kind, value: amount, reason: note, proposedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.moderation.proposed', subjectType: 'exam_moderation', subjectId: m!.id, data: { paperId: id, kind, value: amount, note } });
      await this.tasks.createForRole(tx, p.tenantId, ['principal', 'exam_controller'], { ownerId: p.userId, title: 'Approve a moderation of marks', description: `${kind === 'add' ? `Add ${amount} marks` : `Scale by ${amount}%`}: ${note}`, sourceModule: 'exam_office', sourceId: id, priority: 'normal', slaHours: 48 });
      return { id: m!.id, status: 'proposed' };
    }
    const [m] = await tx.select().from(examModerations).where(and(eq(examModerations.paperId, id), inArray(examModerations.status, ['proposed', 'approved'])));
    if (!m) throw new ConflictException('There is no open moderation for this paper');
    if (action === 'approve' || action === 'reject') {
      if (m.status !== 'proposed') throw new ConflictException('The moderation is already decided');
      if (!p.roles.some((r) => APPROVERS.has(r))) throw new ForbiddenException('Only the principal or the controller of examinations can decide a moderation');
      if (m.proposedBy === p.userId) throw new ForbiddenException('A moderation must be approved by someone other than the person who proposed it');
      if (action === 'reject' && !note) throw new BadRequestException('Say why the moderation is rejected');
      const status = action === 'approve' ? 'approved' : 'rejected';
      await tx.update(examModerations).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note }).where(eq(examModerations.id, m.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `exam.moderation.${status}`, subjectType: 'exam_moderation', subjectId: m.id, data: { paperId: id, note } });
      return { id: m.id, status };
    }
    if (action === 'apply_moderation') {
      if (m.status !== 'approved') throw new ConflictException('Approve the moderation first');
      const rows = await tx.select().from(marks).where(eq(marks.assessmentId, paper.assessmentId!));
      let applied = 0;
      for (const r of rows) {
        const next = moderate(r.absent ? null : r.marks, m.kind as 'add' | 'scale', m.value, paper.maxMarks);
        if (next === null) continue;
        await tx.update(marks).set({ moderatedMarks: next, moderationNote: `Moderation: ${m.reason}` }).where(and(eq(marks.assessmentId, r.assessmentId), eq(marks.studentId, r.studentId)));
        applied++;
      }
      await tx.update(assessments).set({ markStatus: 'moderated' }).where(eq(assessments.id, paper.assessmentId!));
      await tx.update(examModerations).set({ status: 'applied', appliedCount: applied }).where(eq(examModerations.id, m.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.moderation.applied', subjectType: 'exam_moderation', subjectId: m.id, data: { paperId: id, applied } });
      return { id: m.id, status: 'applied', applied };
    }
    throw new BadRequestException('Unknown action');
  }

  private async registrationAction(tx: Tx, p: UserPrincipal, id: string, action: string, note: string | null, value: unknown) {
    const [sid, stid] = pair(id);
    const [reg] = await tx.select().from(examRegistrations).where(and(eq(examRegistrations.sessionId, sid), eq(examRegistrations.studentId, stid)));
    if (!reg) throw new NotFoundException('Registration not found');
    if (action === 'override') {
      if (reg.status === 'registered') throw new ConflictException('The candidate is already registered');
      if (!note || note.length < 3) throw new BadRequestException('Give the reason for the override');
      await tx.update(examRegistrations).set({ status: 'registered', overriddenBy: p.userId, overrideReason: note }).where(and(eq(examRegistrations.sessionId, sid), eq(examRegistrations.studentId, stid)));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.registration.overridden', subjectType: 'exam_registration', subjectId: stid, data: { sessionId: sid, note } });
      return { status: 'registered' };
    }
    await syncExamFees(tx, { sessionId: sid, studentId: stid });
    const [fee] = await tx.select().from(examFeeDues).where(and(eq(examFeeDues.sessionId, sid), eq(examFeeDues.studentId, stid)));
    if (!fee) throw new ConflictException('No exam fee has been raised for this candidate');
    if (fee.status !== 'due') throw new ConflictException('The exam fee is already settled');
    if (action === 'fee_paid' || action === 'fee_waive') {
      const receipt = typeof (value as { receiptNo?: unknown })?.receiptNo === 'string' ? (value as { receiptNo: string }).receiptNo.trim() : '';
      // A fee on the fee account is paid like any other fee (the counter, online, the apps); waiving it cancels the invoice.
      const [inv] = fee.feeInvoiceId ? await tx.select().from(feeInvoices).where(eq(feeInvoices.id, fee.feeInvoiceId)) : [];
      if (action === 'fee_paid' && inv && inv.status !== 'cancelled') throw new ConflictException('This exam fee is on the student\'s fee account: collect it at the fees counter or online and it settles here');
      if (action === 'fee_paid' && !receipt) throw new BadRequestException('Enter the receipt number');
      if (action === 'fee_waive' && !note) throw new BadRequestException('Say why the fee is waived');
      if (action === 'fee_waive' && inv) {
        if (inv.paidPaise > 0) throw new ConflictException('Part of this fee is paid; ask the accounts office to adjust it');
        await tx.update(feeInvoices).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
      }
      const status = action === 'fee_paid' ? 'paid' : 'waived';
      await tx.update(examFeeDues).set({ status, receiptNo: receipt || null, note, settledBy: p.userId, settledAt: new Date() }).where(eq(examFeeDues.id, fee.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `exam.fee.${status}`, subjectType: 'exam_fee', subjectId: stid, data: { sessionId: sid, receipt: receipt || null, note } });
      return { status };
    }
    throw new BadRequestException('Unknown action');
  }

  private async ticketAction(tx: Tx, p: UserPrincipal, id: string, action: string, note: string | null) {
    const [sid, stid] = pair(id);
    const [h] = await tx.select().from(hallTickets).where(and(eq(hallTickets.sessionId, sid), eq(hallTickets.studentId, stid)));
    if (!h) throw new NotFoundException('Hall ticket not found');
    if (action !== 'block' && action !== 'unblock') throw new BadRequestException('Unknown action');
    if (!note || note.length < 3) throw new BadRequestException('Give the reason');
    const blocked = action === 'block';
    if (h.blocked === blocked) throw new ConflictException(blocked ? 'The hall ticket is already withheld' : 'The hall ticket is already issued');
    await tx.update(hallTickets).set({ blocked, blockedReason: blocked ? note : null }).where(and(eq(hallTickets.sessionId, sid), eq(hallTickets.studentId, stid)));
    // A withheld ticket already printed now verifies as revoked.
    if (blocked) await this.issued.revokeSource(tx, p, 'hall_ticket', `${sid}:${stid}`, `Withheld: ${note}`);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `exam.hall_ticket.${blocked ? 'withheld' : 'released'}`, subjectType: 'hall_ticket', subjectId: stid, data: { sessionId: sid, note } });
    const [s] = await tx.select({ name: examSessions.name }).from(examSessions).where(eq(examSessions.id, sid));
    await this.notes.examNotice(tx, [stid], {
      kind: 'marks',
      text: blocked
        ? { en: { title: 'Hall ticket withheld', body: `Your hall ticket for ${s!.name} is withheld: ${note}` }, hi: { title: 'प्रवेश पत्र रोका गया', body: `${s!.name} का प्रवेश पत्र रोका गया है: ${note}` }, kn: { title: 'ಪ್ರವೇಶ ಪತ್ರ ತಡೆಹಿಡಿಯಲಾಗಿದೆ', body: `${s!.name} ಪ್ರವೇಶ ಪತ್ರ ತಡೆಹಿಡಿಯಲಾಗಿದೆ: ${note}` } }
        : { en: { title: 'Hall ticket issued', body: `Your hall ticket for ${s!.name} is ready to download.` }, hi: { title: 'प्रवेश पत्र जारी', body: `${s!.name} का प्रवेश पत्र डाउनलोड के लिए तैयार है।` }, kn: { title: 'ಪ್ರವೇಶ ಪತ್ರ ನೀಡಲಾಗಿದೆ', body: `${s!.name} ಪ್ರವೇಶ ಪತ್ರ ಡೌನ್‌ಲೋಡ್‌ಗೆ ಸಿದ್ಧವಾಗಿದೆ.` } },
      data: { sessionId: sid, studentId: stid },
      dedupeKey: `hall-ticket:${sid}:${stid}`,
    });
    return { blocked };
  }

  private async qpAction(tx: Tx, p: UserPrincipal, id: string, action: string, note: string | null, value: unknown) {
    if (!UUID.test(id)) throw new NotFoundException('Record not found');
    const [qp] = await tx.select().from(extQuestionPapers).where(eq(extQuestionPapers.id, id));
    if (!qp) throw new NotFoundException('Question paper not found');
    const done = async (set: Partial<typeof extQuestionPapers.$inferInsert>, verb: string) => {
      await tx.update(extQuestionPapers).set(set).where(eq(extQuestionPapers.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `qp.${verb}`, subjectType: 'question_paper', subjectId: id, data: { note } });
      return { status: set.status ?? qp.status };
    };
    switch (action) {
      case 'submit_qp':
        if (qp.status !== 'draft') throw new ConflictException('Only a draft can be sent for scrutiny');
        if (!qp.content.trim()) throw new ConflictException('The paper has no questions yet');
        return done({ status: 'scrutiny', submittedAt: new Date() }, 'submitted');
      case 'approve': {
        if (qp.status !== 'scrutiny') throw new ConflictException('The paper is not in scrutiny');
        const cfg = (await officeSettings(tx)).settings;
        const [{ n }] = await this.q<{ n: number }>(tx, sql`select count(*)::int as n from ext_question_papers where code is not null`);
        return done({ status: 'approved', approvedBy: p.userId, approvedAt: new Date(), scrutinyNote: note, code: qp.code ?? formatSeries(cfg.qpSeries, cfg.qpSeries.next + n, new Date()) }, 'approved');
      }
      case 'reject':
        if (qp.status !== 'scrutiny') throw new ConflictException('The paper is not in scrutiny');
        if (!note) throw new BadRequestException('Say what the setter must change');
        return done({ status: 'draft', scrutinyNote: note, version: qp.version + 1 }, 'returned');
      case 'lock': {
        if (qp.status !== 'approved') throw new ConflictException('Approve the paper before locking it');
        const raw = (value as { releaseAt?: unknown })?.releaseAt;
        const releaseAt = typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : null;
        if (!releaseAt) throw new BadRequestException('Set the release time');
        const hash = createHash('sha256').update(qp.content).digest('hex');
        return done({ status: 'locked', lockedAt: new Date(), releaseAt, contentHash: hash }, 'locked');
      }
      case 'release':
        if (qp.status !== 'locked') throw new ConflictException('Only a locked paper can be released');
        if (qp.releaseAt && qp.releaseAt.getTime() > Date.now()) throw new ConflictException('The paper is sealed until its release time');
        if (qp.contentHash && createHash('sha256').update(qp.content).digest('hex') !== qp.contentHash) throw new ConflictException('The paper changed after it was locked; it cannot be released');
        return done({ status: 'released', releasedBy: p.userId, releasedAt: new Date() }, 'released');
      default:
        throw new BadRequestException('Unknown action');
    }
  }

  // ---- reports --------------------------------------------------------------------------------

  report(p: UserPrincipal, report: Report, f: { sessionId?: string; by?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = f.sessionId && UUID.test(f.sessionId) ? f.sessionId : null;
      if (!sid) return { columns: [], rows: [] };
      await syncExamFees(tx, { sessionId: sid });
      const R = (columns: Related['columns'], rows: Row[]) => ({ columns, rows });
      switch (report) {
        case 'registration_summary':
          return R(
            [{ key: 'class' }, { key: 'candidates' }, { key: 'registered' }, { key: 'ineligible' }, { key: 'not_registered' }, { key: 'fee_paid' }, { key: 'fee_due' }],
            await this.q(tx, sql`select sec.display_name as class, count(st.id) as candidates, count(r.student_id) filter (where r.status = 'registered') as registered, count(r.student_id) filter (where r.status = 'ineligible') as ineligible,
              count(st.id) filter (where r.student_id is null) as not_registered, count(f.id) filter (where f.status in ('paid', 'waived')) as fee_paid, count(f.id) filter (where f.status = 'due') as fee_due
              from sections sec join students st on st.section_id = sec.id and st.status = 'active' left join exam_registrations r on r.session_id = ${sid}::uuid and r.student_id = st.id left join exam_fee_dues f on f.session_id = ${sid}::uuid and f.student_id = st.id
              where sec.id in (select section_id from exam_papers where session_id = ${sid}::uuid) group by sec.display_name order by sec.display_name`),
          );
        case 'hall_tickets':
          return R(
            [{ key: 'ticket_no' }, { key: 'roll_no' }, { key: 'student' }, { key: 'class' }, { key: 'status', format: 'status' }, { key: 'reason' }],
            await this.q(tx, sql`select h.ticket_no, st.roll_no, st.full_name as student, sec.display_name as class, case when h.blocked then 'blocked' else 'issued' end as status, h.blocked_reason as reason from hall_tickets h join students st on st.id = h.student_id join sections sec on sec.id = st.section_id where h.session_id = ${sid}::uuid order by h.ticket_no`),
          );
        case 'seating_plan':
          return R(
            [{ key: 'date', format: 'date' }, { key: 'time' }, { key: 'room' }, { key: 'seat_no' }, { key: 'roll_no' }, { key: 'student' }, { key: 'subject' }],
            await this.q(tx, sql`select p.exam_date as date, to_char(p.starts_at, 'HH24:MI') as time, r.name as room, es.seat_no, st.roll_no, st.full_name as student, sub.name as subject from exam_seats es join exam_papers p on p.id = es.paper_id join rooms r on r.id = es.room_id join students st on st.id = es.student_id join subjects sub on sub.id = p.subject_id where p.session_id = ${sid}::uuid order by p.exam_date, p.starts_at, r.name, es.seat_no`),
          );
        case 'invigilation':
          return R(
            [{ key: 'date', format: 'date' }, { key: 'time' }, { key: 'room' }, { key: 'staff' }, { key: 'role', format: 'status' }, { key: 'status', format: 'status' }],
            await this.q(tx, sql`select d.duty_date as date, to_char(d.starts_at, 'HH24:MI') || '–' || to_char(d.ends_at, 'HH24:MI') as time, r.name as room, u.full_name as staff, d.role, d.status from invigilation_duties d join rooms r on r.id = d.room_id join users u on u.id = d.staff_id where d.session_id = ${sid}::uuid order by d.duty_date, d.starts_at, r.name`),
          );
        case 'attendance':
          return R(
            [{ key: 'date', format: 'date' }, { key: 'subject' }, { key: 'class' }, { key: 'candidates' }, { key: 'present' }, { key: 'absent' }, { key: 'debarred' }, { key: 'absentees' }],
            await this.q(tx, sql`select p.exam_date as date, sub.name as subject, sec.display_name as class, count(a.student_id) as candidates, count(*) filter (where a.status = 'present') as present, count(*) filter (where a.status = 'absent') as absent, count(*) filter (where a.status = 'debarred') as debarred,
              coalesce(string_agg(st.roll_no, ', ' order by st.roll_no) filter (where a.status <> 'present'), '—') as absentees
              from exam_papers p join subjects sub on sub.id = p.subject_id join sections sec on sec.id = p.section_id left join exam_attendance a on a.paper_id = p.id left join students st on st.id = a.student_id where p.session_id = ${sid}::uuid group by p.id, p.exam_date, sub.name, sec.display_name order by p.exam_date`),
          );
        case 'malpractice':
          return R(
            [{ key: 'date', format: 'date' }, { key: 'roll_no' }, { key: 'student' }, { key: 'subject' }, { key: 'description' }, { key: 'status', format: 'status' }, { key: 'penalty' }],
            await this.q(tx, sql`select m.created_at as date, st.roll_no, st.full_name as student, coalesce(sub.name, '—') as subject, m.description, m.status, coalesce(m.penalty, '—') as penalty from malpractice_cases m join students st on st.id = m.student_id left join exam_papers p on p.id = m.paper_id left join subjects sub on sub.id = p.subject_id where m.session_id = ${sid}::uuid order by m.created_at`),
          );
        case 'valuation_status':
          return R(
            [{ key: 'subject' }, { key: 'scripts' }, { key: 'uploaded' }, { key: 'allocated' }, { key: 'valued' }, { key: 'needs_third' }, { key: 'finalised' }, { key: 'external' }],
            await this.q(tx, sql`select sub.name as subject, count(e.id) as scripts, count(*) filter (where e.status = 'uploaded') as uploaded, count(*) filter (where e.status = 'allocated') as allocated, count(*) filter (where e.status = 'valued') as valued,
              count(*) filter (where e.status = 'needs_third') as needs_third, count(*) filter (where e.status = 'finalised') as finalised, (select count(*) from ext_valuation_scripts v where v.paper_id = p.id) as external
              from exam_papers p join subjects sub on sub.id = p.subject_id left join eval_scripts e on e.paper_id = p.id where p.session_id = ${sid}::uuid group by p.id, sub.name order by sub.name`),
          );
        case 'tabulation': {
          const lines = await this.q<Row>(tx, sql`select st.roll_no, st.full_name as student, sub.code, l.percent, l.grade, r.sgpa, r.cgpa, r.outcome from exam_results r join students st on st.id = r.student_id join exam_result_lines l on l.result_id = r.id join subjects sub on sub.id = l.subject_id where r.session_id = ${sid}::uuid order by st.roll_no, sub.code`);
          const codes = [...new Set(lines.map((l) => String(l.code)))];
          const byStudent = new Map<string, Row>();
          for (const l of lines) {
            const row = byStudent.get(String(l.roll_no)) ?? { roll_no: l.roll_no, student: l.student, sgpa: num(l.sgpa), cgpa: num(l.cgpa), status: l.outcome };
            row[`s_${l.code}`] = `${num(l.percent)} (${l.grade})`;
            byStudent.set(String(l.roll_no), row);
          }
          return R([{ key: 'roll_no' }, { key: 'student' }, ...codes.map((c) => ({ key: `s_${c}`, format: 'text' as const })), { key: 'sgpa' }, { key: 'cgpa' }, { key: 'status', format: 'status' }], [...byStudent.values()]);
        }
        case 'result_analysis': {
          if (f.by === 'topper')
            return R(
              [{ key: 'rank' }, { key: 'roll_no' }, { key: 'student' }, { key: 'class' }, { key: 'sgpa' }, { key: 'cgpa' }],
              await this.q(tx, sql`select rank() over (order by r.sgpa desc) as rank, st.roll_no, st.full_name as student, sec.display_name as class, r.sgpa, r.cgpa from exam_results r join students st on st.id = r.student_id join sections sec on sec.id = st.section_id where r.session_id = ${sid}::uuid order by r.sgpa desc limit 10`),
            );
          const group = f.by === 'section' ? sql`sec.display_name` : sql`sub.name`;
          const lines = await this.q<{ g: string; percent: string; passed: boolean }>(tx, sql`select ${group} as g, l.percent, l.passed from exam_result_lines l join exam_results r on r.id = l.result_id join subjects sub on sub.id = l.subject_id join students st on st.id = r.student_id join sections sec on sec.id = st.section_id where r.session_id = ${sid}::uuid`);
          const groups = new Map<string, { percent: number; passed: boolean }[]>();
          for (const l of lines) groups.set(l.g, [...(groups.get(l.g) ?? []), { percent: Number(l.percent), passed: l.passed }]);
          return R(
            [{ key: f.by === 'section' ? 'class' : 'subject' }, { key: 'appeared' }, { key: 'passed' }, { key: 'failed' }, { key: 'pass_percent', format: 'percent' }, { key: 'mean', format: 'percent' }, { key: 'highest', format: 'percent' }],
            [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, ls]) => {
              const s = passStats(ls);
              return { [f.by === 'section' ? 'class' : 'subject']: g, appeared: s.appeared, passed: s.passed, failed: s.failed, pass_percent: s.passPercent, mean: s.mean, highest: s.highest };
            }),
          );
        }
        case 'revaluation_outcomes':
          return R(
            [{ key: 'roll_no' }, { key: 'student' }, { key: 'subject' }, { key: 'kind', format: 'status' }, { key: 'status', format: 'status' }, { key: 'previous_percent', format: 'percent' }, { key: 'new_percent', format: 'percent' }, { key: 'change' }, { key: 'fee', format: 'money' }],
            await this.q(tx, sql`select st.roll_no, st.full_name as student, sub.name as subject, v.kind, v.status::text as status, v.previous_percent, v.new_percent, case when v.new_percent is null then '—' else to_char(v.new_percent - v.previous_percent, 'SG990.00') end as change, v.fee_paise as fee
              from revaluation_requests v join students st on st.id = v.student_id join subjects sub on sub.id = v.subject_id where v.session_id = ${sid}::uuid order by v.created_at`),
          );
        case 'pass_fail': {
          const rows = await this.q<{ class: string; outcome: string }>(tx, sql`select sec.display_name as class, r.outcome from exam_results r join students st on st.id = r.student_id join sections sec on sec.id = st.section_id where r.session_id = ${sid}::uuid`);
          const groups = new Map<string, string[]>();
          for (const r of rows) groups.set(r.class, [...(groups.get(r.class) ?? []), r.outcome]);
          const out = [...groups.entries()].map(([c, os]) => {
            const passed = os.filter((o) => o === 'pass' || o === 'passed' || o === 'promoted').length;
            return { class: c, appeared: os.length, passed, failed: os.length - passed, pass_percent: os.length ? Math.round((passed / os.length) * 10000) / 100 : 0 };
          });
          const all = out.reduce((a, r) => ({ appeared: a.appeared + r.appeared, passed: a.passed + r.passed }), { appeared: 0, passed: 0 });
          if (out.length) out.push({ class: 'Total', appeared: all.appeared, passed: all.passed, failed: all.appeared - all.passed, pass_percent: all.appeared ? Math.round((all.passed / all.appeared) * 10000) / 100 : 0 });
          return R([{ key: 'class' }, { key: 'appeared' }, { key: 'passed' }, { key: 'failed' }, { key: 'pass_percent', format: 'percent' }], out);
        }
      }
    });
  }

  // ---- settings and overview ------------------------------------------------------------------

  getSettings(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { settings, configured } = await officeSettings(tx);
      const scales = await tx.select({ id: gradeScales.id, name: gradeScales.name, isDefault: gradeScales.isDefault }).from(gradeScales);
      return { settings: { ...settings, defaultGradeScaleId: settings.defaultGradeScaleId ?? scales.find((s) => s.isDefault)?.id ?? null }, configured, gradeScales: scales };
    });
  }

  saveSettings(p: UserPrincipal, body: OfficeSettings) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = (await officeSettings(tx)).settings;
      const next = withDefaults(body);
      if (next.defaultGradeScaleId) {
        const [s] = await tx.select({ id: gradeScales.id }).from(gradeScales).where(eq(gradeScales.id, next.defaultGradeScaleId));
        if (!s) throw new BadRequestException('Grade scale not found');
        await tx.update(gradeScales).set({ isDefault: sql`${gradeScales.id} = ${next.defaultGradeScaleId}::uuid` });
      }
      // The exam cell's own rules (`cell`, src/exam-cell/settings.ts) and relative grading (`relativeGrading`,
      // src/exams/relative-grading.store.ts) live in the same row and are kept.
      const [raw] = await tx.select({ settings: examOfficeSettings.settings }).from(examOfficeSettings);
      const kept = (raw?.settings as { cell?: unknown; relativeGrading?: unknown } | undefined) ?? {};
      const stored = { ...next, ...(kept.cell === undefined ? {} : { cell: kept.cell }), ...(kept.relativeGrading === undefined ? {} : { relativeGrading: kept.relativeGrading }) };
      await tx.insert(examOfficeSettings).values({ tenantId: p.tenantId, settings: stored, updatedBy: p.userId }).onConflictDoUpdate({ target: examOfficeSettings.tenantId, set: { settings: stored, updatedBy: p.userId, updatedAt: new Date() } });
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      for (const k of Object.keys(next) as (keyof OfficeSettings)[]) if (JSON.stringify(before[k]) !== JSON.stringify(next[k])) changes[k] = { before: before[k], after: next[k] };
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam_office.settings.saved', subjectType: 'exam_office_settings', changes });
      return { settings: next };
    });
  }

  /** Every session with its current stage and the counts the office desk shows. */
  overview(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sessions = await this.q<{ id: string; name: string; status: string; starts_on: string; ends_on: string; programme: string }>(tx, sql`select s.id, s.name, s.status, s.starts_on, s.ends_on, pr.name as programme from exam_sessions s join programs pr on pr.id = s.program_id order by s.starts_on desc`);
      const out = [];
      for (const s of sessions) {
        const f = await this.facts(tx, s.id);
        const rows = await this.stageRows(tx, s.id);
        const states = stageStates(rows, f);
        const cur = currentStage(rows, f);
        out.push({ ...s, starts_on: iso(s.starts_on), ends_on: iso(s.ends_on), stage: cur, pending: states.find((x) => x.stage === cur)?.pending ?? false, done: states.filter((x) => x.state === 'done').length, total: STAGES.length, candidates: f.registrations, feeOpen: f.feeOpen, scriptsOpen: f.scriptsOpen, moderationsOpen: f.moderationsOpen, revaluationsOpen: f.revaluationsOpen });
      }
      const [counts] = await this.q<Row>(tx, sql`select (select count(*) from ext_question_papers where status = 'scrutiny') as qp_scrutiny, (select count(*) from ext_question_papers where status = 'locked') as qp_sealed,
        (select count(*) from revaluation_requests where status = 'requested') as reval_open, (select count(*) from academic_doc_requests where status in ('requested', 'approved')) as cert_open, (select count(*) from exam_moderations where status = 'proposed') as mod_open`);
      return { sessions: out, counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, Number(v)])) };
    });
  }
}

export type { OfficeSettings };
