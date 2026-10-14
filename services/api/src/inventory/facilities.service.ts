import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import { readSettings } from '../campus-ops/settings.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, assets, rooms, sections, subjects, timetableSlots } from '../db/schema.js';
import { facilityBookings, maintenanceTickets } from '../db/schema-procurement.js';
import { canMoveTicket, dueAfter, isoWeekday, overlaps, type Priority } from './procurement.logic.js';

/** Who runs the estate: approves hall bookings, works maintenance tickets and keeps the rooms list. */
export const FACILITY_ROLES: RoleName[] = ['tenant_admin', 'principal', 'store_keeper'];
export const isFacilityManager = (p: Pick<UserPrincipal, 'roles'>) => p.roles.some((r) => FACILITY_ROLES.includes(r));

export interface BookingInput {
  roomId: string;
  title: string;
  purpose?: string;
  organiser?: string;
  attendees?: number | null;
  onDate: string;
  startsAt: string;
  endsAt: string;
}

export interface TicketInput {
  category: string;
  priority: Priority;
  title: string;
  description?: string;
  roomId?: string | null;
  assetId?: string | null;
  location?: string;
}

/** Facility bookings (conflict-checked against other bookings and the timetable) and maintenance tickets with deadlines. */
@Injectable()
export class FacilitiesService {
  constructor(private readonly clock: Clock) {}

  today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  now() {
    return this.clock.now();
  }

  /** What already holds the room on that day at that time: approved or waiting bookings, and timetabled classes. */
  async conflicts(tx: Tx, b: Pick<BookingInput, 'roomId' | 'onDate' | 'startsAt' | 'endsAt'>, exceptId?: string) {
    const bookings = await tx
      .select({ id: facilityBookings.id, number: facilityBookings.number, title: facilityBookings.title, startsAt: facilityBookings.startsAt, endsAt: facilityBookings.endsAt, status: facilityBookings.status })
      .from(facilityBookings)
      .where(and(eq(facilityBookings.roomId, b.roomId), eq(facilityBookings.onDate, b.onDate), inArray(facilityBookings.status, ['pending', 'approved']), exceptId ? ne(facilityBookings.id, exceptId) : undefined));
    const classes = await tx
      .select({ id: timetableSlots.id, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt, section: sections.displayName, subject: subjects.name })
      .from(timetableSlots)
      .innerJoin(academicYears, eq(academicYears.id, timetableSlots.academicYearId))
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .where(and(eq(timetableSlots.roomId, b.roomId), eq(timetableSlots.dayOfWeek, isoWeekday(b.onDate)), isNull(timetableSlots.archivedAt), eq(academicYears.isCurrent, true), sql`${b.onDate}::date between ${academicYears.startsOn} and ${academicYears.endsOn}`));
    return { bookings: bookings.filter((x) => overlaps(x, b)), classes: classes.filter((x) => overlaps(x, b)) };
  }

  private async assertFree(tx: Tx, b: Pick<BookingInput, 'roomId' | 'onDate' | 'startsAt' | 'endsAt'>, exceptId?: string) {
    const c = await this.conflicts(tx, b, exceptId);
    if (c.classes.length) {
      const k = c.classes[0];
      throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'BOOKING_CONFLICT', message: `The room has a class then: ${k.section} ${k.subject} (${k.startsAt.slice(0, 5)}–${k.endsAt.slice(0, 5)})` });
    }
    if (c.bookings.length) {
      const k = c.bookings[0];
      throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'BOOKING_CONFLICT', message: `The room is booked then: ${k.number} ${k.title} (${k.startsAt.slice(0, 5)}–${k.endsAt.slice(0, 5)})` });
    }
  }

  /** Books a room. A manager's booking is approved at once; others wait for approval when the settings say so. */
  async book(tx: Tx, p: UserPrincipal, b: BookingInput) {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, b.roomId));
    if (!room || !room.active) throw new BadRequestException('Room not found');
    const manager = isFacilityManager(p);
    if (!room.bookable && !manager) throw new ConflictException('This room cannot be booked; ask the estate office');
    if (b.endsAt <= b.startsAt) throw new BadRequestException('The booking must end after it starts');
    if (b.onDate < (await this.today(tx))) throw new BadRequestException('Book a day from today on');
    if (b.attendees && room.capacity && b.attendees > room.capacity) throw new BadRequestException(`${room.name} seats ${room.capacity}`);
    await this.assertFree(tx, b);
    const needs = (await readSettings(tx, p.tenantId, 'assets')).rules.bookingNeedsApproval !== false;
    const status = manager || !needs ? 'approved' : 'pending';
    const [row] = await tx
      .insert(facilityBookings)
      .values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'FB'), roomId: b.roomId, title: b.title, purpose: b.purpose ?? '', organiser: b.organiser ?? '', attendees: b.attendees ?? null, onDate: b.onDate, startsAt: b.startsAt, endsAt: b.endsAt, status, bookedBy: p.userId, ...(status === 'approved' && { decidedBy: p.userId, decidedAt: new Date() }) })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'facilities.booking_requested', subjectType: 'facility_booking', subjectId: row.id, data: { number: row.number, status } });
    return row;
  }

  async decideBooking(tx: Tx, p: UserPrincipal, id: string, d: { approve: boolean; note?: string }) {
    if (!isFacilityManager(p)) throw new ForbiddenException("Your account doesn't have access to this.");
    const [b] = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).for('update');
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'pending') throw new ConflictException(`This booking is ${b.status}`);
    if (!d.approve && !d.note?.trim()) throw new BadRequestException('Give a reason for rejecting');
    if (d.approve) {
      const c = await this.conflicts(tx, b, id);
      if (c.classes.length || c.bookings.some((x) => x.status === 'approved')) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'BOOKING_CONFLICT', message: 'Another booking or a class now holds the room at that time' });
    }
    const status = d.approve ? 'approved' : 'rejected';
    const [row] = await tx.update(facilityBookings).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: d.note ?? null }).where(eq(facilityBookings.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `facilities.booking_${status}`, subjectType: 'facility_booking', subjectId: id, before: { status: b.status }, after: { status } });
    return row;
  }

  /** The person who booked, or a manager, cancels a booking that is waiting or approved. */
  async cancelBooking(tx: Tx, p: UserPrincipal, id: string, note?: string) {
    const [b] = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).for('update');
    if (!b || (b.bookedBy !== p.userId && !isFacilityManager(p))) throw new NotFoundException('Booking not found');
    if (!['pending', 'approved'].includes(b.status)) throw new ConflictException(`This booking is ${b.status}`);
    const [row] = await tx.update(facilityBookings).set({ status: 'cancelled', decisionNote: note ?? b.decisionNote }).where(eq(facilityBookings.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'facilities.booking_cancelled', subjectType: 'facility_booking', subjectId: id, before: { status: b.status }, after: { status: 'cancelled' } });
    return row;
  }

  /** Raises a maintenance ticket; it falls due after the settings' hours for its priority. */
  async raise(tx: Tx, p: UserPrincipal, b: TicketInput) {
    if (b.roomId && !(await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, b.roomId)))[0]) throw new BadRequestException('Room not found');
    if (b.assetId && !(await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, b.assetId)))[0]) throw new BadRequestException('Asset not found');
    const rules = (await readSettings(tx, p.tenantId, 'assets')).rules;
    const key = `sla${b.priority.charAt(0).toUpperCase()}${b.priority.slice(1)}Hours`;
    const hours = Number(rules[key] ?? 72);
    const now = this.now();
    const [row] = await tx
      .insert(maintenanceTickets)
      .values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'MT'), category: b.category, priority: b.priority, title: b.title, description: b.description ?? '', roomId: b.roomId ?? null, assetId: b.assetId ?? null, location: b.location ?? '', raisedBy: p.userId, slaHours: hours, dueAt: dueAfter(now, hours), createdAt: now, updatedAt: now })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'facilities.ticket_raised', subjectType: 'maintenance_ticket', subjectId: row.id, data: { number: row.number, priority: b.priority } });
    return row;
  }

  /** A manager moves a ticket on: assign, start, hold, resolve (with what was done), close, or reopen. */
  async move(tx: Tx, p: UserPrincipal, id: string, b: { status: string; assigneeName?: string; assigneeUserId?: string | null; resolution?: string; costPaise?: number; note?: string }) {
    if (!isFacilityManager(p)) throw new ForbiddenException("Your account doesn't have access to this.");
    const [t] = await tx.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, id)).for('update');
    if (!t) throw new NotFoundException('Ticket not found');
    if (!canMoveTicket(t.status, b.status)) throw new ConflictException(`A ${t.status.replace('_', ' ')} ticket cannot become ${b.status.replace('_', ' ')}`);
    if (b.status === 'assigned' && !b.assigneeName?.trim() && !b.assigneeUserId) throw new BadRequestException('Say who it is assigned to');
    if (b.status === 'resolved' && !b.resolution?.trim()) throw new BadRequestException('Say what was done');
    const now = this.now();
    const set: Partial<typeof maintenanceTickets.$inferInsert> = { status: b.status, updatedAt: now };
    if (!t.respondedAt && b.status !== 'open') set.respondedAt = now;
    if (b.assigneeName !== undefined) set.assigneeName = b.assigneeName;
    if (b.assigneeUserId !== undefined) set.assigneeUserId = b.assigneeUserId;
    if (b.status === 'resolved') Object.assign(set, { resolvedAt: now, resolution: b.resolution, costPaise: b.costPaise ?? t.costPaise });
    if (b.status === 'closed') set.closedAt = now;
    if (b.status === 'open') Object.assign(set, { resolvedAt: null, closedAt: null });
    const [row] = await tx.update(maintenanceTickets).set(set).where(eq(maintenanceTickets.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.status === 'open' ? 'facilities.ticket_reopened' : `facilities.ticket_${b.status}`, subjectType: 'maintenance_ticket', subjectId: id, before: { status: t.status, assigneeName: t.assigneeName }, after: { status: row.status, assigneeName: row.assigneeName }, data: b.note ? { note: b.note } : undefined });
    return row;
  }

  /** The person who raised a resolved ticket rates the fix and closes it, or reopens it. */
  async feedback(tx: Tx, p: UserPrincipal, id: string, b: { rating: number; reopen: boolean; note?: string }) {
    const [t] = await tx.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, id)).for('update');
    if (!t || (t.raisedBy !== p.userId && !isFacilityManager(p))) throw new NotFoundException('Ticket not found');
    if (t.status !== 'resolved') throw new ConflictException('Only a resolved ticket can be rated');
    const now = this.now();
    const [row] = await tx.update(maintenanceTickets).set(b.reopen ? { status: 'open', resolvedAt: null, rating: b.rating, updatedAt: now } : { status: 'closed', closedAt: now, rating: b.rating, updatedAt: now }).where(eq(maintenanceTickets.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.reopen ? 'facilities.ticket_reopened' : 'facilities.ticket_closed', subjectType: 'maintenance_ticket', subjectId: id, before: { status: t.status }, after: { status: row.status }, data: { rating: b.rating, note: b.note } });
    return row;
  }
}
