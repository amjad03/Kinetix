import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { attendanceRecords, assessments, feeInvoices, grievanceTickets, marks, mentorAssignments, sections, students, users, welfareRequests } from '../db/schema.js';
import { addDays } from '../hr/dates.js';
import { OPEN_STATUSES } from '../welfare/welfare-rules.js';
import { interventionReassessments } from '../db/schema-depth.js';
import type { interventionPlans } from '../db/schema.js';
import { reassessOutcome, riskOf, type RiskInputs } from './mentoring-rules.js';

/** A mark below this share of the maximum counts as failing. */
const PASS_FRACTION = 0.35;
/** Attendance is judged over this many recent days. */
const ATTENDANCE_WINDOW_DAYS = 60;

export interface RiskRow {
  assignmentId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  section: string;
  mentorUserId: string;
  mentorName: string;
  attendancePct: number | null;
  failingMarks: number;
  overdueFees: number;
  openCases: number;
  score: number;
  level: 'none' | 'low' | 'medium' | 'high';
  signals: { kind: string; value: number }[];
}

/** Reads existing tables (read-only) to flag students who need a mentor's attention. */
@Injectable()
export class MentoringService {
  constructor(private readonly clock: Clock) {}

  now() {
    return this.clock.now();
  }

  today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  /** The open assignment of a student, if any. */
  async openAssignment(tx: Tx, studentId: string) {
    const [a] = await tx.select().from(mentorAssignments).where(and(eq(mentorAssignments.studentId, studentId), isNull(mentorAssignments.endedOn)));
    return a ?? null;
  }

  /** Mentees with their risk signals, highest risk first. `mentorUserId` narrows to one mentor. */
  async riskList(tx: Tx, opts: { mentorUserId?: string; attendanceThreshold: number; includeNone?: boolean }): Promise<RiskRow[]> {
    const today = await this.today(tx);
    const rows = await tx
      .select({
        assignmentId: mentorAssignments.id,
        studentId: students.id,
        studentName: students.fullName,
        rollNo: students.rollNo,
        section: sections.displayName,
        mentorUserId: mentorAssignments.mentorUserId,
        mentorName: users.fullName,
      })
      .from(mentorAssignments)
      .innerJoin(students, eq(students.id, mentorAssignments.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(users, eq(users.id, mentorAssignments.mentorUserId))
      .where(and(isNull(mentorAssignments.endedOn), opts.mentorUserId ? eq(mentorAssignments.mentorUserId, opts.mentorUserId) : undefined));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.studentId);

    const inputs = await this.inputsFor(tx, ids, today);

    const out = rows.map((r): RiskRow => {
      const i = inputs.get(r.studentId)!;
      const risk = riskOf(i, opts.attendanceThreshold);
      return { ...r, attendancePct: i.attendancePct, failingMarks: i.failingMarks, overdueFees: i.overdueFees, openCases: i.openCases, ...risk };
    });
    return out.filter((r) => opts.includeNone || r.level !== 'none').sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName));
  }

  /** Attendance, failing marks, overdue fees and open cases for each student id. */
  private async inputsFor(tx: Tx, ids: string[], today: string): Promise<Map<string, RiskInputs>> {
    const att = await tx
      .select({
        studentId: attendanceRecords.studentId,
        attended: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))::int`,
        absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
      })
      .from(attendanceRecords)
      .where(and(inArray(attendanceRecords.studentId, ids), sql`${attendanceRecords.date} >= ${addDays(today, -ATTENDANCE_WINDOW_DAYS)}`))
      .groupBy(attendanceRecords.studentId);
    const failing = await tx
      .select({ studentId: marks.studentId, n: sql<number>`count(*)::int` })
      .from(marks)
      .innerJoin(assessments, eq(assessments.id, marks.assessmentId))
      .where(and(inArray(marks.studentId, ids), eq(marks.absent, false), sql`${assessments.publishedAt} is not null`, sql`coalesce(${marks.moderatedMarks}, ${marks.marks}) is not null`, sql`coalesce(${marks.moderatedMarks}, ${marks.marks}) < ${assessments.maxMarks} * ${PASS_FRACTION}`))
      .groupBy(marks.studentId);
    const fees = await tx
      .select({ studentId: feeInvoices.studentId, n: sql<number>`count(*)::int` })
      .from(feeInvoices)
      .where(and(inArray(feeInvoices.studentId, ids), eq(feeInvoices.status, 'due'), lt(feeInvoices.dueOn, today)))
      .groupBy(feeInvoices.studentId);
    const welfare = await tx
      .select({ studentId: welfareRequests.studentId, n: sql<number>`count(*)::int` })
      .from(welfareRequests)
      .where(and(inArray(welfareRequests.studentId, ids), inArray(welfareRequests.status, ['submitted', 'under_review'])))
      .groupBy(welfareRequests.studentId);
    // Committee matters and anonymous reports never reach a mentor.
    const grievances = await tx
      .select({ studentId: grievanceTickets.studentId, n: sql<number>`count(*)::int` })
      .from(grievanceTickets)
      .where(and(inArray(grievanceTickets.studentId, ids), inArray(grievanceTickets.status, OPEN_STATUSES), isNull(grievanceTickets.committee), eq(grievanceTickets.anonymous, false)))
      .groupBy(grievanceTickets.studentId);

    const extra = await this.extraSignals(tx, ids, today);
    const by = <T extends { studentId: string | null }>(list: T[]) => new Map(list.map((x) => [x.studentId, x]));
    const attBy = by(att);
    const failBy = by(failing);
    const feeBy = by(fees);
    const welBy = by(welfare);
    const grvBy = by(grievances);
    return new Map(
      ids.map((id): [string, RiskInputs] => {
        const a = attBy.get(id);
        const days = a ? a.attended + a.absent : 0;
        return [
          id,
          {
            ...extra.get(id),
            attendancePct: days > 0 ? Math.round((a!.attended / days) * 100) : null,
            attendanceDays: days,
            failingMarks: failBy.get(id)?.n ?? 0,
            overdueFees: feeBy.get(id)?.n ?? 0,
            openCases: (welBy.get(id)?.n ?? 0) + (grvBy.get(id)?.n ?? 0),
          },
        ];
      }),
    );
  }

  /** Outcome, skill, assignment and engagement signals for each student id (kept apart from the first four so those stay cheap). */
  private async extraSignals(tx: Tx, ids: string[], today: string): Promise<Map<string, Partial<RiskInputs>>> {
    const list = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
    const out = new Map<string, Partial<RiskInputs>>();
    const put = (id: string, patch: Partial<RiskInputs>) => out.set(id, { ...out.get(id), ...patch });
    const since = addDays(today, -ATTENDANCE_WINDOW_DAYS);
    const outcomes = (await tx.execute(sql`select student_id, count(*)::int as n from (
        select m.student_id, cm.co_id from marks m join assessments a on a.id = m.assessment_id join assessment_co_map cm on cm.assessment_id = a.id
        where m.student_id in (${list}) and a.published_at is not null and m.absent = false and a.max_marks > 0 and coalesce(m.moderated_marks, m.marks) is not null
        group by m.student_id, cm.co_id having avg(100.0 * coalesce(m.moderated_marks, m.marks) / a.max_marks) < 50) t group by student_id`)).rows as { student_id: string; n: number }[];
    for (const r of outcomes) put(r.student_id, { lowOutcomes: r.n });
    const skills = (await tx.execute(sql`select student_id, count(*)::int as n from (select student_id, skill_id, max(level) as best from skill_evidence where student_id in (${list}) group by student_id, skill_id) t where best < 2 group by student_id`)).rows as { student_id: string; n: number }[];
    for (const r of skills) put(r.student_id, { lowSkills: r.n });
    const missed = (await tx.execute(sql`select s.id as student_id, count(*)::int as n from students s join homework h on h.section_id = s.section_id
        where s.id in (${list}) and h.due_on < ${today}::date and h.due_on >= ${since}::date
          and not exists (select 1 from homework_submissions hs where hs.homework_id = h.id and hs.student_id = s.id) group by s.id`)).rows as { student_id: string; n: number }[];
    for (const r of missed) put(r.student_id, { missedAssignments: r.n });
    const eng = (await tx.execute(sql`select student_id, count(*)::int as total, count(*) filter (where outcome = 'skipped')::int as skipped from participation_events
        where student_id in (${list}) and occurred_at >= ${since}::date group by student_id`)).rows as { student_id: string; total: number; skipped: number }[];
    for (const r of eng) if (r.total >= 5 && r.skipped / r.total >= 0.6) put(r.student_id, { lowEngagement: true });
    return out;
  }

  /** The current risk of one student: score and the signals behind it. */
  async riskFor(tx: Tx, studentId: string, attendanceThreshold = 75): Promise<{ score: number; signals: { kind: string; value: number }[] }> {
    const today = await this.today(tx);
    const inputs = (await this.inputsFor(tx, [studentId], today)).get(studentId)!;
    const r = riskOf(inputs, attendanceThreshold);
    return { score: r.score, signals: r.signals };
  }

  /** Records the risk when a plan opens, to be set against the risk at its review date. */
  async openReassessment(tx: Tx, plan: typeof interventionPlans.$inferSelect): Promise<void> {
    const now = await this.riskFor(tx, plan.studentId);
    await tx.insert(interventionReassessments).values({ tenantId: plan.tenantId, planId: plan.id, studentId: plan.studentId, scoreBefore: now.score, signalsBefore: now.signals, dueOn: plan.reviewOn }).onConflictDoNothing();
  }

  /** Measures the risk again and stores the change; the first call settles the plan's reassessment, later calls refresh it until it is closed. */
  async runReassessment(tx: Tx, planId: string) {
    const [re] = await tx.select().from(interventionReassessments).where(eq(interventionReassessments.planId, planId));
    if (!re) return null;
    const now = await this.riskFor(tx, re.studentId);
    const [row] = await tx.update(interventionReassessments).set({ scoreAfter: now.score, signalsAfter: now.signals, assessedAt: this.now(), outcome: reassessOutcome(re.scoreBefore, now.score) }).where(eq(interventionReassessments.id, re.id)).returning();
    return row;
  }

  /** Plans whose review date has come and that have not been measured yet. */
  async reassessDue(tx: Tx): Promise<number> {
    const today = await this.today(tx);
    const due = await tx.select({ planId: interventionReassessments.planId }).from(interventionReassessments).where(and(isNull(interventionReassessments.assessedAt), sql`${interventionReassessments.dueOn} <= ${today}`));
    for (const d of due) await this.runReassessment(tx, d.planId);
    return due.length;
  }

  /** One class: every student's attendance %, average mark % over published assessments, and risk flag. Fees and welfare detail stay with mentors. */
  async sectionInsights(tx: Tx, sectionId: string, attendanceThreshold: number) {
    const today = await this.today(tx);
    const roster = await tx.select({ studentId: students.id, studentName: students.fullName, rollNo: students.rollNo }).from(students).where(eq(students.sectionId, sectionId)).orderBy(students.rollNo);
    if (roster.length === 0) return { sectionId, students: [], classAttendancePct: null, classMarksAvgPct: null };
    const ids = roster.map((r) => r.studentId);
    const inputs = await this.inputsFor(tx, ids, today);
    const avg = await tx
      .select({ studentId: marks.studentId, pct: sql<string | null>`avg(coalesce(${marks.moderatedMarks}, ${marks.marks}) * 100.0 / nullif(${assessments.maxMarks}, 0))` })
      .from(marks)
      .innerJoin(assessments, eq(assessments.id, marks.assessmentId))
      .where(and(inArray(marks.studentId, ids), eq(marks.absent, false), sql`${assessments.publishedAt} is not null`, sql`coalesce(${marks.moderatedMarks}, ${marks.marks}) is not null`))
      .groupBy(marks.studentId);
    const pctBy = new Map(avg.map((a) => [a.studentId, a.pct === null ? null : Math.round(Number(a.pct))]));
    const rows = roster.map((r) => {
      const i = inputs.get(r.studentId)!;
      const risk = riskOf(i, attendanceThreshold);
      return { ...r, attendancePct: i.attendancePct, marksAvgPct: pctBy.get(r.studentId) ?? null, failingMarks: i.failingMarks, level: risk.level, signals: risk.signals };
    });
    const mean = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x !== null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    return { sectionId, students: rows, classAttendancePct: mean(rows.map((r) => r.attendancePct)), classMarksAvgPct: mean(rows.map((r) => r.marksAvgPct)) };
  }
}
