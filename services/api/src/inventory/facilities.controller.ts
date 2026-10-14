import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { Day, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { assets, auditLog, rooms, users } from '../db/schema.js';
import { facilityBookings, maintenanceTickets } from '../db/schema-procurement.js';
import { FacilitiesService, isFacilityManager } from './facilities.service.js';
import { STAFF_ROLES } from './inventory.controller.js';
import { PRIORITIES, slaState } from './procurement.logic.js';

const Time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use a time like 14:30');
export const TICKET_CATEGORIES = ['electrical', 'it', 'civil', 'plumbing', 'carpentry', 'housekeeping', 'other'] as const;
const BookingBody = z.object({ roomId: z.uuid(), title: z.string().trim().min(2).max(160), purpose: z.string().trim().max(500).default(''), organiser: z.string().trim().max(120).default(''), attendees: z.number().int().min(1).max(100_000).nullish(), onDate: Day, startsAt: Time, endsAt: Time });
const DecisionBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });
const NoteBody = z.object({ note: z.string().trim().max(300).optional() }).default({});
const TicketBody = z.object({ category: z.enum(TICKET_CATEGORIES), priority: z.enum(PRIORITIES as [string, ...string[]]).default('normal'), title: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).default(''), roomId: z.uuid().nullish(), assetId: z.uuid().nullish(), location: z.string().trim().max(160).default('') });
const MoveBody = z.object({ status: z.enum(['open', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed']), assigneeName: z.string().trim().max(120).optional(), assigneeUserId: z.uuid().nullish(), resolution: z.string().trim().max(1000).optional(), costPaise: Paise.optional(), note: z.string().trim().max(300).optional() });
const FeedbackBody = z.object({ rating: z.number().int().min(1).max(5), reopen: z.boolean().default(false), note: z.string().trim().max(300).optional() });

/**
 * Facilities: bookable rooms and halls (seminar hall, auditorium, labs) with conflict-checked, approved bookings, and
 * maintenance tickets (electrical, IT, civil…) with a deadline by priority. Every staff member books and raises; the
 * estate office (principal, administrator, store keeper) decides and works the queue.
 */
@Controller('v1/facilities')
export class FacilitiesController {
  constructor(
    private readonly db: DbService,
    private readonly svc: FacilitiesService,
  ) {}

  /** Rooms people may book (managers see every active room). */
  @Get('rooms')
  @Auth('user', STAFF_ROLES)
  rooms(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: rooms.id, name: rooms.name, kind: rooms.kind, capacity: rooms.capacity, facilities: rooms.facilities, bookable: rooms.bookable })
        .from(rooms)
        .where(and(eq(rooms.active, true), isFacilityManager(p) ? undefined : eq(rooms.bookable, true)))
        .orderBy(asc(rooms.name)),
    );
  }

  /** A room's day: bookings and timetabled classes, to pick a free time. */
  @Get('rooms/:id/day')
  @Auth('user', STAFF_ROLES)
  day(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('date') date?: string) {
    const d = Day.safeParse(date);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [room] = await tx.select({ id: rooms.id, name: rooms.name }).from(rooms).where(eq(rooms.id, id));
      if (!room) throw new NotFoundException('Room not found');
      const on = d.success ? d.data : await this.svc.today(tx);
      const held = await this.svc.conflicts(tx, { roomId: id, onDate: on, startsAt: '00:00', endsAt: '23:59' });
      return { room, date: on, bookings: held.bookings.sort((a, b) => a.startsAt.localeCompare(b.startsAt)), classes: held.classes.sort((a, b) => a.startsAt.localeCompare(b.startsAt)) };
    });
  }

  @Post('bookings')
  @Auth('user', STAFF_ROLES)
  book(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BookingBody)) b: z.infer<typeof BookingBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.book(tx, p, b));
  }

  /** Bookings: a manager sees all, everyone else their own; upcoming first. */
  @Get('bookings')
  @Auth('user', STAFF_ROLES)
  bookings(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('from') from?: string) {
    const f = Day.safeParse(from);
    return this.db.withTenant(p.tenantId, async (tx) =>
      (await tx
        .select({ b: facilityBookings, room: rooms.name, by: users.fullName })
        .from(facilityBookings)
        .innerJoin(rooms, eq(rooms.id, facilityBookings.roomId))
        .leftJoin(users, eq(users.id, facilityBookings.bookedBy))
        .where(and(isFacilityManager(p) ? undefined : eq(facilityBookings.bookedBy, p.userId), status ? eq(facilityBookings.status, status) : undefined, f.success ? sql`${facilityBookings.onDate} >= ${f.data}::date` : undefined))
        .orderBy(asc(facilityBookings.onDate), asc(facilityBookings.startsAt))
        .limit(500)).map((r) => ({ ...r.b, room: r.room, bookedByName: r.by })),
    );
  }

  @Post('bookings/:id/decision')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.decideBooking(tx, p, id, b));
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(NoteBody)) b: z.infer<typeof NoteBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.cancelBooking(tx, p, id, b.note));
  }

  // --- Maintenance tickets -------------------------------------------------------------------------

  @Post('tickets')
  @Auth('user', STAFF_ROLES)
  raise(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TicketBody)) b: z.infer<typeof TicketBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.raise(tx, p, b as never));
  }

  /** The queue against its deadlines: counts by status and category, breached and at-risk tickets, average rating. */
  @Get('tickets/summary')
  @Auth('user', STAFF_ROLES)
  summary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(maintenanceTickets).where(isFacilityManager(p) ? undefined : eq(maintenanceTickets.raisedBy, p.userId));
      const now = this.svc.now();
      const open = rows.filter((r) => !['resolved', 'closed'].includes(r.status));
      const done = rows.filter((r) => r.resolvedAt);
      const states = rows.map((r) => slaState(r, now));
      const rated = rows.filter((r) => r.rating !== null);
      const count = (xs: string[]) => Object.fromEntries([...new Set(xs)].map((k) => [k, xs.filter((x) => x === k).length]));
      return {
        total: rows.length,
        open: open.length,
        breached: open.filter((r) => slaState(r, now) === 'breached').length,
        atRisk: open.filter((r) => slaState(r, now) === 'at_risk').length,
        metPct: done.length ? Math.round((states.filter((s) => s === 'met').length / done.length) * 1000) / 10 : null,
        avgResolveHours: done.length ? Math.round((done.reduce((s, r) => s + (r.resolvedAt!.getTime() - r.createdAt.getTime()), 0) / done.length / 3_600_000) * 10) / 10 : null,
        avgRating: rated.length ? Math.round((rated.reduce((s, r) => s + r.rating!, 0) / rated.length) * 10) / 10 : null,
        byStatus: count(rows.map((r) => r.status)),
        byCategory: count(open.map((r) => r.category)),
      };
    });
  }

  /** Tickets: a manager sees all, everyone else what they raised; with each one's deadline state. */
  @Get('tickets')
  @Auth('user', STAFF_ROLES)
  tickets(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ t: maintenanceTickets, room: rooms.name, asset: assets.tag, by: users.fullName })
        .from(maintenanceTickets)
        .leftJoin(rooms, eq(rooms.id, maintenanceTickets.roomId))
        .leftJoin(assets, eq(assets.id, maintenanceTickets.assetId))
        .leftJoin(users, eq(users.id, maintenanceTickets.raisedBy))
        .where(and(isFacilityManager(p) ? undefined : eq(maintenanceTickets.raisedBy, p.userId), status ? inArray(maintenanceTickets.status, status.split(',').slice(0, 6)) : undefined))
        .orderBy(asc(maintenanceTickets.dueAt))
        .limit(500);
      const now = this.svc.now();
      return rows.map((r) => ({ ...r.t, room: r.room, assetTag: r.asset, raisedByName: r.by, sla: slaState(r.t, now) }));
    });
  }

  /** One ticket with its history. */
  @Get('tickets/:id')
  @Auth('user', STAFF_ROLES)
  ticket(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select({ t: maintenanceTickets, room: rooms.name, asset: assets.tag, by: users.fullName }).from(maintenanceTickets).leftJoin(rooms, eq(rooms.id, maintenanceTickets.roomId)).leftJoin(assets, eq(assets.id, maintenanceTickets.assetId)).leftJoin(users, eq(users.id, maintenanceTickets.raisedBy)).where(eq(maintenanceTickets.id, id));
      if (!r || (r.t.raisedBy !== p.userId && !isFacilityManager(p))) throw new NotFoundException('Ticket not found');
      const history = await tx.select({ action: auditLog.action, at: auditLog.at, actor: users.fullName, data: auditLog.data }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(and(eq(auditLog.subjectType, 'maintenance_ticket'), eq(auditLog.subjectId, id))).orderBy(desc(auditLog.at));
      return { ...r.t, room: r.room, assetTag: r.asset, raisedByName: r.by, sla: slaState(r.t, this.svc.now()), history };
    });
  }

  @Post('tickets/:id/status')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  move(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MoveBody)) b: z.infer<typeof MoveBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.move(tx, p, id, b));
  }

  @Post('tickets/:id/feedback')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  feedback(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FeedbackBody)) b: z.infer<typeof FeedbackBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.feedback(tx, p, id, b));
  }
}
