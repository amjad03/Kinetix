import { Body, ConflictException, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, or, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { grievanceTickets, sections, students } from '../db/schema.js';
import { antiraggingUndertakings, pwdAccommodations } from '../db/schema-life.js';
import { yearLabelOf } from '../campus-life/kit-shared.js';
import { COMMITTEE_ROLES, GRIEVANCE_STAFF, WELFARE_ROLES } from './welfare.access.js';
import { WelfareService } from './welfare.service.js';

const Year = z.string().regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27');
const RequestBody = z.object({ yearLabel: Year, sectionIds: z.array(z.uuid()).max(500).optional() });
const MineBody = z.object({ studentId: z.uuid().optional(), yearLabel: Year, studentRef: z.string().trim().min(4).max(80), parentRef: z.string().trim().min(4).max(80) });

/**
 * Welfare depth: collecting anti-ragging undertakings (the office asks a class; the student gives the numbers from
 * antiragging.in), the accommodations the exam office needs on a day, and the grievance statistics for NAAC.
 * The lists are record kit entities (welfare.records.ts).
 */
@Controller('v1/welfare')
export class WelfareDepthController {
  constructor(
    private readonly db: DbService,
    private readonly svc: WelfareService,
  ) {}

  /** Opens a pending undertaking for every active student (of the given classes) who has none for the year, and tells them. */
  @Post('undertakings/request')
  @Auth('user', [...GRIEVANCE_STAFF, 'admissions_officer'])
  @HttpCode(200)
  request(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const roster = await tx
        .select({ id: students.id, userId: students.userId })
        .from(students)
        .where(and(eq(students.status, 'active'), b.sectionIds?.length ? inArray(students.sectionId, b.sectionIds) : undefined, sql`not exists (select 1 from antiragging_undertakings u where u.student_id = ${students.id} and u.year_label = ${b.yearLabel})`));
      if (roster.length) await tx.insert(antiraggingUndertakings).values(roster.map((s) => ({ tenantId: p.tenantId, studentId: s.id, yearLabel: b.yearLabel })));
      const people = roster.length
        ? (await tx.execute<{ user_id: string }>(sql`select g.user_id from guardians g where g.student_id in (${sql.join(roster.map((s) => sql`${s.id}::uuid`), sql`, `)}) union select s.user_id from students s where s.id in (${sql.join(roster.map((s) => sql`${s.id}::uuid`), sql`, `)}) and s.user_id is not null`)).rows.map((r) => r.user_id)
        : [];
      await this.svc.notify(tx, people, 'welfare', 'Anti-ragging undertaking', `Please submit the student and parent undertakings for ${b.yearLabel} at antiragging.in and give us the two reference numbers.`, `undertaking:${b.yearLabel}`);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'antiragging_undertaking.requested', subjectType: 'antiragging_undertaking', data: { yearLabel: b.yearLabel, students: roster.length } });
      return { requested: roster.length };
    });
  }

  /** The student (or a parent) gives the two reference numbers. */
  @Post('undertakings/mine')
  @Auth('user', ['student', 'guardian'])
  @HttpCode(200)
  mine(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MineBody)) b: z.infer<typeof MineBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, b.studentId);
      const [cur] = await tx.select().from(antiraggingUndertakings).where(and(eq(antiraggingUndertakings.studentId, sid), eq(antiraggingUndertakings.yearLabel, b.yearLabel)));
      if (cur?.status === 'verified') throw new ConflictException('Your undertaking is already verified');
      const today = this.svc.now().toISOString().slice(0, 10);
      const [row] = cur
        ? await tx.update(antiraggingUndertakings).set({ studentRef: b.studentRef, parentRef: b.parentRef, submittedOn: today, status: 'received' }).where(eq(antiraggingUndertakings.id, cur.id)).returning()
        : await tx.insert(antiraggingUndertakings).values({ tenantId: p.tenantId, studentId: sid, yearLabel: b.yearLabel, studentRef: b.studentRef, parentRef: b.parentRef, submittedOn: today, status: 'received' }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'antiragging_undertaking.submitted', subjectType: 'antiragging_undertaking', subjectId: row.id, before: cur ? { studentRef: cur.studentRef, parentRef: cur.parentRef } : {}, after: { studentRef: b.studentRef, parentRef: b.parentRef } });
      return row;
    });
  }

  /** Undertaking collection by class for a year: how many asked, received and verified. */
  @Get('undertakings/summary')
  @Auth('user', [...GRIEVANCE_STAFF, 'hod', 'admissions_officer'])
  summary(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const y = year && /^\d{4}-\d{2}$/.test(year) ? year : yearLabelOf(this.svc.now());
      const rows = await tx
        .select({ sectionId: sections.id, className: sections.displayName, students: sql<number>`count(distinct ${students.id})::int`, pending: sql<number>`count(*) filter (where ${antiraggingUndertakings.status} = 'pending')::int`, received: sql<number>`count(*) filter (where ${antiraggingUndertakings.status} = 'received')::int`, verified: sql<number>`count(*) filter (where ${antiraggingUndertakings.status} = 'verified')::int` })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .leftJoin(antiraggingUndertakings, and(eq(antiraggingUndertakings.studentId, students.id), eq(antiraggingUndertakings.yearLabel, y)))
        .where(eq(students.status, 'active'))
        .groupBy(sections.id, sections.displayName)
        .orderBy(asc(sections.displayName));
      return { year: y, classes: rows.map((r) => ({ ...r, missing: r.students - r.pending - r.received - r.verified })) };
    });
  }

  /** Accommodations in force on a day, for the exam office's seating and invigilation (scribes, extra time, rooms). */
  @Get('accommodations/exam-feed')
  @Auth('user', [...WELFARE_ROLES, 'exam_controller', 'hod'])
  examFeed(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => {
      const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : this.svc.now().toISOString().slice(0, 10);
      return tx
        .select({ studentId: students.id, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, disability: pwdAccommodations.disability, scribe: pwdAccommodations.scribe, extraMinutesPerHour: pwdAccommodations.extraMinutesPerHour, separateRoom: pwdAccommodations.separateRoom, groundFloor: pwdAccommodations.groundFloor, other: pwdAccommodations.other, validUntil: pwdAccommodations.validUntil })
        .from(pwdAccommodations)
        .innerJoin(students, eq(students.id, pwdAccommodations.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(and(eq(pwdAccommodations.status, 'active'), or(isNull(pwdAccommodations.validUntil), gte(pwdAccommodations.validUntil, day)), sectionId && /^[0-9a-f-]{36}$/i.test(sectionId) ? eq(students.sectionId, sectionId) : undefined))
        .orderBy(asc(sections.displayName), asc(students.rollNo));
    });
  }

  /** Grievances for a year in NAAC terms: received and resolved by category, average days to resolve, appeals. Committee matters are counted, never shown. */
  @Get('reports/grievances')
  @Auth('user', [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES])
  grievanceReport(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const start = year && /^\d{4}$/.test(year) ? Number(year) : Number(yearLabelOf(this.svc.now()).slice(0, 4));
      const from = new Date(`${start}-06-01T00:00:00Z`);
      const to = new Date(`${start + 1}-06-01T00:00:00Z`);
      const rows = await tx
        .select({ category: grievanceTickets.category, committee: grievanceTickets.committee, received: sql<number>`count(*)::int`, resolved: sql<number>`count(*) filter (where ${grievanceTickets.resolvedAt} is not null)::int`, avgDays: sql<number | null>`round(avg(extract(epoch from ${grievanceTickets.resolvedAt} - ${grievanceTickets.createdAt}) / 86400)::numeric, 1)::float8`, appeals: sql<number>`count(*) filter (where ${grievanceTickets.appealStatus} is not null)::int`, overturned: sql<number>`count(*) filter (where ${grievanceTickets.appealStatus} = 'overturned')::int` })
        .from(grievanceTickets)
        .where(and(gte(grievanceTickets.createdAt, from), lte(grievanceTickets.createdAt, to)))
        .groupBy(grievanceTickets.category, grievanceTickets.committee)
        .orderBy(asc(grievanceTickets.category));
      const total = rows.reduce((s, r) => s + r.received, 0);
      const resolved = rows.reduce((s, r) => s + r.resolved, 0);
      return { year: yearLabelOf(from), total, resolved, pending: total - resolved, byCategory: rows };
    });
  }
}
