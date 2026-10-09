import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { assessments, attendanceRecords, businessRules, homework, homeworkSubmissions, marks, students, subjects } from '../db/schema.js';
import { ruleInForce } from '../governance/governance.logic.js';

/** One student's record as aggregates, for the tutor and the parent assistant: no names, only figures and subject names. */
export interface LearningFacts {
  subjects: { subject: string; averagePercent: number; assessments: number }[];
  strongestSubject: string | null;
  weakestSubjects: string[];
  attendancePercent: number | null;
  homework: { assignedLast30Days: number; handedIn: number };
  /** Active institutional policies the answer must respect (grading, attendance), from the business rule registry. */
  policies: { title: string; params: Record<string, unknown> }[];
}

const POLICY_DOMAINS = ['grading', 'attendance'];

/** Published marks per subject, whole-day attendance and homework hand-ins over the last 30 days, and the policies in force. */
export async function learningFacts(tx: Tx, studentId: string, today: string): Promise<LearningFacts> {
  const rows = await tx
    .select({
      subject: subjects.name,
      pct: sql<number>`avg(coalesce(${marks.moderatedMarks}, ${marks.marks}) / nullif(${assessments.maxMarks}, 0) * 100)::float`,
      n: sql<number>`count(*)::int`,
    })
    .from(marks)
    .innerJoin(assessments, eq(assessments.id, marks.assessmentId))
    .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
    .where(and(eq(marks.studentId, studentId), isNotNull(assessments.publishedAt), eq(marks.absent, false)))
    .groupBy(subjects.name);
  const subs = rows.filter((r) => r.pct !== null).map((r) => ({ subject: r.subject, averagePercent: Math.round(r.pct * 10) / 10, assessments: r.n })).sort((a, b) => a.averagePercent - b.averagePercent);

  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceDay = since.toISOString().slice(0, 10);
  const [att] = await tx
    .select({ total: sql<number>`count(*)::int`, present: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))::int` })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.studentId, studentId), isNull(attendanceRecords.timetableSlotId), gte(attendanceRecords.date, sinceDay)));

  const [stu] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
  const [hw] = stu
    ? await tx
        .select({ assigned: sql<number>`count(*)::int`, handedIn: sql<number>`count(${homeworkSubmissions.studentId})::int` })
        .from(homework)
        .leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.homeworkId, homework.id), eq(homeworkSubmissions.studentId, studentId)))
        .where(and(eq(homework.sectionId, stu.sectionId), gte(homework.dueOn, sinceDay), sql`${homework.dueOn} <= ${today}`))
    : [{ assigned: 0, handedIn: 0 }];

  const rules = await tx.select().from(businessRules).where(and(eq(businessRules.status, 'approved'), inArray(businessRules.domain, POLICY_DOMAINS)));
  const keys = [...new Set(rules.map((r) => `${r.domain}/${r.key}`))];
  const policies = keys
    .map((k) => ruleInForce(rules.filter((r) => `${r.domain}/${r.key}` === k), today))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ title: r.title, params: r.params }));

  return {
    subjects: subs,
    strongestSubject: subs.length ? subs[subs.length - 1].subject : null,
    weakestSubjects: subs.slice(0, 2).filter((s) => s.averagePercent < 60).map((s) => s.subject),
    attendancePercent: att.total ? Math.round((att.present / att.total) * 1000) / 10 : null,
    homework: { assignedLast30Days: hw?.assigned ?? 0, handedIn: hw?.handedIn ?? 0 },
    policies,
  };
}

/** `{ status: count }` for a table's status column. */
export async function countsByStatus(tx: Tx, table: string): Promise<Record<string, number>> {
  const { rows } = await tx.execute<{ status: string; n: number }>(sql`select status::text as status, count(*)::int as n from ${sql.identifier(table)} group by status`);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
