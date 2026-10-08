import { Controller, Get } from '@nestjs/common';
import { and, count, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Clock, localParts } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import {
  applications,
  assessments,
  attainmentSnapshots,
  attendanceRecords,
  examPapers,
  examSessions,
  feeInvoices,
  feePayments,
  leaveRequests,
  marks,
  staffProfiles,
  students,
} from '../db/schema.js';
import { addDays } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { DASHBOARD_ROLES } from './admin.controller.js';

const ACADEMIC: RoleName[] = [...DASHBOARD_ROLES];
const FEES: RoleName[] = ['principal', 'tenant_admin', 'accountant'];
const HR: RoleName[] = ['principal', 'tenant_admin', 'hr_manager', 'hod'];
const ADMISSIONS: RoleName[] = ['principal', 'tenant_admin', 'admissions_officer'];
const PEOPLE: RoleName[] = ['principal', 'tenant_admin', 'hr_manager'];
const STUDENTS: RoleName[] = ['principal', 'tenant_admin', 'hod', 'admissions_officer', 'accountant'];

const has = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));
const monthOf = (date: string) => date.slice(0, 7);
/** The first day of the month `back` months before `date`'s month. */
function monthStart(date: string, back = 0) {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 10);
}
const pct = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/**
 * The numbers behind the role dashboards in one call: head counts, the month's fees, what is waiting for a
 * decision and a six-month trend of attendance, internal marks and CO attainment. Each block is `null`
 * for a role that may not see it (fees for a head of department, for example).
 */
@Controller('v1/admin')
export class DashboardController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
  ) {}

  @Get('dashboard')
  @Auth('user', [...new Set<RoleName>([...ACADEMIC, ...FEES, ...ADMISSIONS, ...PEOPLE])])
  dashboard(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      const thisMonth = monthStart(today);
      const prevMonth = monthStart(today, 1);
      const firstShown = monthStart(today, 5);

      const people = has(p, STUDENTS)
        ? await (async () => {
            const [s] = await tx
              .select({ total: count(), joined: sql<number>`count(*) filter (where ${students.enrolledOn} >= ${thisMonth})::int`, prevJoined: sql<number>`count(*) filter (where ${students.enrolledOn} >= ${prevMonth} and ${students.enrolledOn} < ${thisMonth})::int` })
              .from(students)
              .where(eq(students.status, 'active'));
            return s;
          })()
        : null;
      const staff = has(p, [...PEOPLE, 'hod'])
        ? (await tx.select({ total: count() }).from(staffProfiles).where(eq(staffProfiles.status, 'active')))[0]
        : null;

      let attendance: { today: number | null; previous: number | null } | null = null;
      let performance: { month: string; attendance: number | null; internalMarks: number | null; coAttainment: number | null }[] | null = null;
      if (has(p, ACADEMIC)) {
        const rate = async (from: string, to: string) => {
          const [t] = await tx
            .select({ marked: count(), attended: sql<number>`count(*) filter (where ${attendanceRecords.status} <> 'absent')::int` })
            .from(attendanceRecords)
            .where(and(gte(attendanceRecords.date, from), lt(attendanceRecords.date, to)));
          return t.marked === 0 ? null : pct((t.attended / t.marked) * 100);
        };
        attendance = { today: await rate(today, addDays(today, 1)), previous: await rate(addDays(today, -7), today) };

        const monthExpr = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM')`;
        const att = await tx
          .select({ m: monthExpr(attendanceRecords.date), marked: count(), attended: sql<number>`count(*) filter (where ${attendanceRecords.status} <> 'absent')::int` })
          .from(attendanceRecords)
          .where(gte(attendanceRecords.date, firstShown))
          .groupBy(monthExpr(attendanceRecords.date));
        const internal = await tx
          .select({ m: monthExpr(assessments.heldOn), v: sql<number | null>`avg(coalesce(${marks.moderatedMarks}, ${marks.marks}) / nullif(${assessments.maxMarks}, 0) * 100)::float8` })
          .from(marks)
          .innerJoin(assessments, eq(assessments.id, marks.assessmentId))
          .where(and(gte(assessments.heldOn, firstShown), eq(marks.absent, false), inArray(assessments.kind, ['internal', 'test', 'assignment', 'practical'])))
          .groupBy(monthExpr(assessments.heldOn));
        const co = await tx
          .select({ m: monthExpr(attainmentSnapshots.computedAt), v: sql<number | null>`avg(${attainmentSnapshots.combined})::float8` })
          .from(attainmentSnapshots)
          .where(and(eq(attainmentSnapshots.scope, 'co'), gte(attainmentSnapshots.computedAt, new Date(`${firstShown}T00:00:00Z`))))
          .groupBy(monthExpr(attainmentSnapshots.computedAt));
        performance = Array.from({ length: 6 }, (_, i) => {
          const month = monthOf(monthStart(today, 5 - i));
          const a = att.find((r) => r.m === month);
          return {
            month,
            attendance: a && a.marked > 0 ? pct((a.attended / a.marked) * 100) : null,
            internalMarks: pct(internal.find((r) => r.m === month)?.v ?? null),
            coAttainment: pct(co.find((r) => r.m === month)?.v ?? null),
          };
        });
      }

      let fees: { collected: number; previous: number; outstanding: number; overdueInvoices: number } | null = null;
      if (has(p, FEES)) {
        const collectedIn = async (from: string, to: string) => {
          const [r] = await tx
            .select({ v: sql<number>`coalesce(sum(${feePayments.amountPaise}), 0)::float8` })
            .from(feePayments)
            .where(and(eq(feePayments.status, 'paid'), sql`${feePayments.paidAt}::date >= ${from}`, sql`${feePayments.paidAt}::date < ${to}`));
          return r.v;
        };
        const [o] = await tx
          .select({ outstanding: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}), 0)::float8`, overdue: sql<number>`count(*) filter (where ${feeInvoices.dueOn} < ${today})::int` })
          .from(feeInvoices)
          .where(eq(feeInvoices.status, 'due'));
        fees = { collected: await collectedIn(thisMonth, monthStart(today, -1)), previous: await collectedIn(prevMonth, thisMonth), outstanding: o.outstanding, overdueInvoices: o.overdue };
      }

      const pending = {
        leave: has(p, HR) ? (await tx.select({ n: count() }).from(leaveRequests).where(eq(leaveRequests.status, 'pending')))[0].n : null,
        marksToVerify: has(p, ACADEMIC) ? (await tx.select({ n: count() }).from(assessments).where(eq(assessments.markStatus, 'submitted')))[0].n : null,
        examPapers: has(p, ACADEMIC)
          ? (
              await tx
                .select({ n: count() })
                .from(examPapers)
                .innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId))
                .where(and(inArray(examSessions.status, ['draft', 'scheduled']), gte(examPapers.examDate, today)))
            )[0].n
          : null,
        feeFollowUps: fees?.overdueInvoices ?? null,
        admissionsReview: has(p, ADMISSIONS) ? (await tx.select({ n: count() }).from(applications).where(inArray(applications.status, ['submitted', 'under_review']))).at(0)!.n : null,
      };

      return { date: today, students: people, staff, attendance, fees, pending, performance };
    });
  }
}
