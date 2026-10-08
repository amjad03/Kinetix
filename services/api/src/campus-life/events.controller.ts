import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { campusEvents, eventFeedback, eventRegistrations, students } from '../db/schema.js';
import { found } from '../placements/placements.access.js';
import { FAMILY, LIFE_STAFF } from './campus-life.access.js';
import { CampusLifeService } from './campus-life.service.js';

const TYPES = ['seminar', 'workshop', 'parent_meeting', 'fest', 'sports', 'competition', 'conference', 'alumni', 'other'] as const;
const Base = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).default(''),
  eventType: z.enum(TYPES).default('other'),
  venue: z.string().trim().max(200).default(''),
  capacity: z.number().int().min(1).max(100000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  audience: z.enum(['all', 'students', 'parents', 'staff']).default('all'),
  feePaise: Paise.default(0),
});
const EventBody = Base.extend({ publish: z.boolean().default(false) }).refine((b) => b.endsAt > b.startsAt, { message: 'The event must end after it starts', path: ['endsAt'] });
const EventPatch = Base.partial();
const StudentBody = z.object({ studentId: z.uuid().optional() });
const FeedbackBody = z.object({ studentId: z.uuid().optional(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).default('') });
const CheckInBody = z.object({ token: z.string().trim().min(8).max(100) });

/** Campus events: schedule, capacity with a waitlist, a QR token per registration, check-in at the door and feedback. Fees are recorded only; nothing is charged here. */
@Controller('v1/campus-life')
export class EventsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CampusLifeService,
  ) {}

  // ---- staff -------------------------------------------------------------------------------

  @Post('events')
  @Auth('user', LIFE_STAFF)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EventBody)) b: z.infer<typeof EventBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { publish, ...rest } = b;
      const [row] = await tx.insert(campusEvents).values({ tenantId: p.tenantId, createdBy: p.userId, status: publish ? 'published' : 'draft', ...rest }).returning();
      await auditUser(tx, p, 'event.created', 'event', row.id, { title: b.title, capacity: b.capacity });
      return row;
    });
  }

  @Patch('events/:id')
  @Auth('user', LIFE_STAFF)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EventPatch)) b: z.infer<typeof EventPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      if (cur.status === 'cancelled') throw new ConflictException('A cancelled event cannot be changed');
      if ((b.endsAt ?? cur.endsAt) <= (b.startsAt ?? cur.startsAt)) throw new BadRequestException('The event must end after it starts');
      const [row] = await tx.update(campusEvents).set(b).where(eq(campusEvents.id, id)).returning();
      // A bigger room lets people in from the waitlist.
      if (b.capacity !== undefined && b.capacity > cur.capacity) await this.promote(tx, row);
      await auditUser(tx, p, 'event.updated', 'event', id, b);
      return row;
    });
  }

  @Post('events/:id/publish')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.setStatus(p, id, 'published', ['draft']);
  }

  @Post('events/:id/cancel')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.setStatus(p, id, 'cancelled', ['draft', 'published']);
  }

  /** Events with registration, waitlist and check-in counts. */
  @Get('events')
  @Auth('user', LIFE_STAFF)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(campusEvents).where(status ? eq(campusEvents.status, status) : undefined).orderBy(desc(campusEvents.startsAt));
      const counts = rows.length
        ? await tx
            .select({ eventId: eventRegistrations.eventId, registered: sql<number>`count(*) filter (where ${eventRegistrations.status} = 'registered')::int`, waitlisted: sql<number>`count(*) filter (where ${eventRegistrations.status} = 'waitlisted')::int`, checkedIn: sql<number>`count(*) filter (where ${eventRegistrations.checkedInAt} is not null)::int` })
            .from(eventRegistrations)
            .where(inArray(eventRegistrations.eventId, rows.map((r) => r.id)))
            .groupBy(eventRegistrations.eventId)
        : [];
      return rows.map((e) => {
        const c = counts.find((x) => x.eventId === e.id);
        return { ...e, registered: c?.registered ?? 0, waitlisted: c?.waitlisted ?? 0, checkedIn: c?.checkedIn ?? 0 };
      });
    });
  }

  @Get('events/:id/registrations')
  @Auth('user', LIFE_STAFF)
  registrations(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ r: eventRegistrations, fullName: students.fullName, rollNo: students.rollNo })
        .from(eventRegistrations)
        .innerJoin(students, eq(students.id, eventRegistrations.studentId))
        .where(and(eq(eventRegistrations.eventId, id), status ? eq(eventRegistrations.status, status) : undefined))
        .orderBy(asc(eventRegistrations.createdAt));
      return rows.map((x) => ({ ...x.r, fullName: x.fullName, rollNo: x.rollNo }));
    });
  }

  /** Scan at the door: the QR token of a registered student marks them present, once. */
  @Post('events/:id/check-in')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  checkIn(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CheckInBody)) b: z.infer<typeof CheckInBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)))[0], 'Event');
      if (ev.status !== 'published') throw new ConflictException('This event is not open');
      const reg = (await tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.qrToken, b.token), eq(eventRegistrations.eventId, id))).for('update'))[0];
      if (!reg) throw new NotFoundException('This code is not for this event');
      if (reg.status !== 'registered') throw new ConflictException(reg.status === 'waitlisted' ? 'This student is on the waitlist' : 'This registration was cancelled');
      if (reg.checkedInAt) throw new ConflictException('Already checked in');
      const [row] = await tx.update(eventRegistrations).set({ checkedInAt: this.svc.now() }).where(eq(eventRegistrations.id, reg.id)).returning();
      const [stu] = await tx.select({ fullName: students.fullName, rollNo: students.rollNo }).from(students).where(eq(students.id, reg.studentId));
      await auditUser(tx, p, 'event.checked_in', 'event', id, { studentId: reg.studentId });
      return { ...row, fullName: stu?.fullName, rollNo: stu?.rollNo };
    });
  }

  /** Attendance count and feedback summary. */
  @Get('events/:id/summary')
  @Auth('user', LIFE_STAFF)
  summary(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)))[0], 'Event');
      const [c] = await tx
        .select({ registered: sql<number>`count(*) filter (where ${eventRegistrations.status} = 'registered')::int`, waitlisted: sql<number>`count(*) filter (where ${eventRegistrations.status} = 'waitlisted')::int`, cancelled: sql<number>`count(*) filter (where ${eventRegistrations.status} = 'cancelled')::int`, attended: sql<number>`count(*) filter (where ${eventRegistrations.checkedInAt} is not null)::int` })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.eventId, id));
      const [f] = await tx.select({ n: sql<number>`count(*)::int`, avg: sql<string | null>`round(avg(${eventFeedback.rating})::numeric, 2)` }).from(eventFeedback).where(eq(eventFeedback.eventId, id));
      return {
        eventId: id,
        title: ev.title,
        capacity: ev.capacity,
        registered: c.registered,
        waitlisted: c.waitlisted,
        cancelled: c.cancelled,
        attended: c.attended,
        attendancePercent: c.registered ? Math.round((c.attended / c.registered) * 100) : 0,
        expectedFeePaise: ev.feePaise * c.registered,
        feedbackCount: f.n,
        averageRating: f.avg === null ? null : Number(f.avg),
      };
    });
  }

  @Get('events/:id/feedback')
  @Auth('user', LIFE_STAFF)
  feedback(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: eventFeedback.id, rating: eventFeedback.rating, comment: eventFeedback.comment, createdAt: eventFeedback.createdAt }).from(eventFeedback).where(eq(eventFeedback.eventId, id)).orderBy(desc(eventFeedback.createdAt)));
  }

  // ---- Student App -------------------------------------------------------------------------

  /** Published events that have not ended, with this student's registration. */
  @Get('me/events')
  @Auth('user', FAMILY)
  myEvents(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, studentId);
      const rows = await tx.select().from(campusEvents).where(and(eq(campusEvents.status, 'published'), ne(campusEvents.audience, 'staff'), gt(campusEvents.endsAt, this.svc.now()))).orderBy(asc(campusEvents.startsAt));
      const regs = await tx.select().from(eventRegistrations).where(eq(eventRegistrations.studentId, sid));
      const taken = rows.length ? await tx.select({ eventId: eventRegistrations.eventId, n: sql<number>`count(*)::int` }).from(eventRegistrations).where(and(inArray(eventRegistrations.eventId, rows.map((r) => r.id)), eq(eventRegistrations.status, 'registered'))).groupBy(eventRegistrations.eventId) : [];
      return rows.map((e) => {
        const r = regs.find((x) => x.eventId === e.id && x.status !== 'cancelled');
        const n = taken.find((x) => x.eventId === e.id)?.n ?? 0;
        return { id: e.id, title: e.title, description: e.description, eventType: e.eventType, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt, audience: e.audience, feePaise: e.feePaise, capacity: e.capacity, seatsLeft: Math.max(0, e.capacity - n), registration: r ? { id: r.id, status: r.status, qrToken: r.qrToken, checkedIn: !!r.checkedInAt } : null };
      });
    });
  }

  /** Registers for an event, or joins the waitlist when it is full. */
  @Post('events/:id/register')
  @Auth('user', FAMILY)
  register(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StudentBody)) b: z.infer<typeof StudentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, b.studentId);
      // The event row is the lock that keeps two people from taking the last seat.
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      if (ev.status !== 'published') throw new ConflictException('Registration is not open for this event');
      if (ev.audience === 'staff') throw new ConflictException('This event is for staff');
      if (ev.endsAt <= this.svc.now()) throw new ConflictException('This event is over');
      const cur = (await tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.studentId, sid))))[0];
      if (cur && cur.status !== 'cancelled') throw new ConflictException('Already registered');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.status, 'registered')));
      const status = n < ev.capacity ? 'registered' : 'waitlisted';
      const [row] = cur
        ? await tx.update(eventRegistrations).set({ status, registeredBy: p.userId, qrToken: token(), checkedInAt: null, createdAt: this.svc.now() }).where(eq(eventRegistrations.id, cur.id)).returning()
        : await tx.insert(eventRegistrations).values({ tenantId: p.tenantId, eventId: id, studentId: sid, registeredBy: p.userId, status, qrToken: token() }).returning();
      await auditUser(tx, p, 'event.registered', 'event', id, { studentId: sid, status });
      return row;
    });
  }

  /** Cancels a registration; the first person on the waitlist gets the seat. */
  @Post('events/:id/cancel-registration')
  @Auth('user', FAMILY)
  @HttpCode(200)
  cancelRegistration(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StudentBody)) b: z.infer<typeof StudentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, b.studentId);
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      const reg = found((await tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.studentId, sid), ne(eventRegistrations.status, 'cancelled'))))[0], 'Registration');
      if (reg.checkedInAt) throw new ConflictException('Already checked in');
      const [row] = await tx.update(eventRegistrations).set({ status: 'cancelled' }).where(eq(eventRegistrations.id, reg.id)).returning();
      if (reg.status === 'registered') await this.promote(tx, ev);
      await auditUser(tx, p, 'event.registration_cancelled', 'event', id, { studentId: sid });
      return row;
    });
  }

  /** This student's registrations, newest event first, each with the QR token to show at the door. */
  @Get('me/registrations')
  @Auth('user', FAMILY)
  myRegistrations(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, studentId);
      const rows = await tx
        .select({ r: eventRegistrations, e: campusEvents, fb: eventFeedback.id })
        .from(eventRegistrations)
        .innerJoin(campusEvents, eq(campusEvents.id, eventRegistrations.eventId))
        .leftJoin(eventFeedback, eq(eventFeedback.registrationId, eventRegistrations.id))
        .where(and(eq(eventRegistrations.studentId, sid), ne(eventRegistrations.status, 'cancelled')))
        .orderBy(desc(campusEvents.startsAt));
      return rows.map((x) => ({ id: x.r.id, eventId: x.e.id, title: x.e.title, venue: x.e.venue, startsAt: x.e.startsAt, endsAt: x.e.endsAt, eventStatus: x.e.status, status: x.r.status, qrToken: x.r.qrToken, checkedIn: !!x.r.checkedInAt, feedbackGiven: x.fb !== null, canGiveFeedback: !!x.r.checkedInAt && x.fb === null }));
    });
  }

  /** One rating and comment, after the student was checked in. */
  @Post('events/:id/feedback')
  @Auth('user', FAMILY)
  giveFeedback(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FeedbackBody)) b: z.infer<typeof FeedbackBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, b.studentId);
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)))[0], 'Event');
      const reg = found((await tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.studentId, sid), eq(eventRegistrations.status, 'registered'))))[0], 'Registration');
      if (!reg.checkedInAt) throw new ConflictException('Feedback is open to those who attended');
      if (ev.startsAt > this.svc.now()) throw new ConflictException('The event has not started');
      const [dup] = await tx.select({ id: eventFeedback.id }).from(eventFeedback).where(eq(eventFeedback.registrationId, reg.id));
      if (dup) throw new ConflictException('Feedback already given');
      const [row] = await tx.insert(eventFeedback).values({ tenantId: p.tenantId, eventId: id, registrationId: reg.id, rating: b.rating, comment: b.comment }).returning();
      await auditUser(tx, p, 'event.feedback', 'event', id, { studentId: sid, rating: b.rating });
      return row;
    });
  }

  // ---- helpers -----------------------------------------------------------------------------

  private setStatus(p: UserPrincipal, id: string, to: string, from: string[]) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      if (!from.includes(cur.status)) throw new ConflictException(`A ${cur.status} event cannot become ${to}`);
      const [row] = await tx.update(campusEvents).set({ status: to }).where(eq(campusEvents.id, id)).returning();
      await auditUser(tx, p, `event.${to}`, 'event', id, { from: cur.status });
      return row;
    });
  }

  /** Moves waitlisted people (first come first served) into free seats. The event row must already be locked. */
  private async promote(tx: Tx, ev: typeof campusEvents.$inferSelect) {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, ev.id), eq(eventRegistrations.status, 'registered')));
    const free = ev.capacity - n;
    if (free <= 0) return;
    const next = await tx.select({ id: eventRegistrations.id }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, ev.id), eq(eventRegistrations.status, 'waitlisted'))).orderBy(asc(eventRegistrations.createdAt)).limit(free);
    if (next.length) await tx.update(eventRegistrations).set({ status: 'registered' }).where(inArray(eventRegistrations.id, next.map((r) => r.id)));
  }
}

/** An unguessable code for the QR on the student's pass. */
const token = () => randomBytes(18).toString('base64url');
