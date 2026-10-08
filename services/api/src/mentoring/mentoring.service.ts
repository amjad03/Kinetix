import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { attendanceRecords, assessments, feeInvoices, grievanceTickets, marks, mentorAssignments, sections, students, users, welfareRequests } from '../db/schema.js';
import { addDays } from '../hr/dates.js';
import { OPEN_STATUSES } from '../welfare/welfare-rules.js';
import { riskOf, type RiskInputs } from './mentoring-rules.js';

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

    const by = <T extends { studentId: string | null }>(list: T[]) => new Map(list.map((x) => [x.studentId, x]));
    const attBy = by(att);
    const failBy = by(failing);
    const feeBy = by(fees);
    const welBy = by(welfare);
    const grvBy = by(grievances);

    const out = rows.map((r): RiskRow => {
      const a = attBy.get(r.studentId);
      const days = a ? a.attended + a.absent : 0;
      const inputs: RiskInputs = {
        attendancePct: days > 0 ? Math.round((a!.attended / days) * 100) : null,
        attendanceDays: days,
        failingMarks: failBy.get(r.studentId)?.n ?? 0,
        overdueFees: feeBy.get(r.studentId)?.n ?? 0,
        openCases: (welBy.get(r.studentId)?.n ?? 0) + (grvBy.get(r.studentId)?.n ?? 0),
      };
      const risk = riskOf(inputs, opts.attendanceThreshold);
      return { ...r, attendancePct: inputs.attendancePct, failingMarks: inputs.failingMarks, overdueFees: inputs.overdueFees, openCases: inputs.openCases, ...risk };
    });
    return out.filter((r) => opts.includeNone || r.level !== 'none').sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName));
  }
}
