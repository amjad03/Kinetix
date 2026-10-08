import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { zonedToInstant } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { guardians, ptmEvents, ptmSlots, students, tenants, timetableSlots, users } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { hasAny, PTM_ORGANISERS, PTM_TEACHERS, SchoolLifeService } from './school-life.service.js';

type Event = typeof ptmEvents.$inferSelect;
type Slot = typeof ptmSlots.$inferSelect;

const Hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 10:30');
const EventBody = z.object({ title: z.string().trim().min(3).max(200), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), location: z.string().trim().max(200).default('') });
const SlotsBody = z.object({ teacherId: z.uuid().optional(), from: Hm, to: Hm, durationMinutes: z.number().int().min(5).max(120) });
const BookBody = z.object({ studentId: z.uuid() });
const RescheduleBody = z.object({ toSlotId: z.uuid() });

const MAX_SLOTS_PER_CALL = 60;

/** Parent-teacher meetings: an event, teachers' time slots, and guardians booking one slot per child per teacher. */
@Controller('v1/ptm')
export class PtmController {
  constructor(
    private readonly db: DbService,
    private readonly svc: SchoolLifeService,
  ) {}

  private async event(tx: Tx, id: string): Promise<Event> {
    return found((await tx.select().from(ptmEvents).where(eq(ptmEvents.id, id)))[0], 'Meeting');
  }

  private async openEvent(tx: Tx, id: string): Promise<Event> {
    const e = await this.event(tx, id);
    if (e.status !== 'open') throw new ConflictException('This meeting is closed');
    return e;
  }

  // ---- events and slots (staff) ---------------------------------------------------------------

  @Post('events')
  @Auth('user', PTM_ORGANISERS)
  createEvent(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EventBody)) b: z.infer<typeof EventBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.insert(ptmEvents).values({ tenantId: p.tenantId, title: b.title, eventDate: b.eventDate, location: b.location, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'ptm.event_created', 'ptm_event', e.id, { date: b.eventDate });
      return e;
    });
  }

  /** Meetings, newest first. Guardians and teachers see them too. */
  @Get('events')
  @Auth('user', ['tenant_admin', 'principal', 'hod', 'teacher', 'guardian'])
  events(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ event: ptmEvents, slots: sql<number>`(select count(*)::int from ptm_slots s where s.event_id = ptm_events.id)`, booked: sql<number>`(select count(*)::int from ptm_slots s where s.event_id = ptm_events.id and s.student_id is not null)` })
        .from(ptmEvents)
        .orderBy(sql`${ptmEvents.eventDate} desc`)
        .limit(100)
        .then((rows) => rows.map((r) => ({ ...r.event, slots: r.slots, booked: r.booked }))),
    );
  }

  @Post('events/:id/close')
  @HttpCode(200)
  @Auth('user', PTM_ORGANISERS)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.event(tx, id);
      const [e] = await tx.update(ptmEvents).set({ status: 'closed' }).where(eq(ptmEvents.id, id)).returning();
      await auditUser(tx, p, 'ptm.event_closed', 'ptm_event', id);
      return e;
    });
  }

  /** Cuts a time range into equal slots for a teacher (yourself, or any teacher for organisers). */
  @Post('events/:id/slots')
  @Auth('user', [...PTM_ORGANISERS, ...PTM_TEACHERS])
  addSlots(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SlotsBody)) b: z.infer<typeof SlotsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.openEvent(tx, id);
      const teacherId = b.teacherId ?? p.userId;
      if (teacherId !== p.userId && !hasAny(p, PTM_ORGANISERS)) throw new ForbiddenException('You can add slots for yourself only');
      const [t] = await tx.select({ id: users.id }).from(users).where(eq(users.id, teacherId));
      if (!t) throw new NotFoundException('Teacher not found');
      const [tenant] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const tz = tenant?.tz ?? 'Asia/Kolkata';
      const start = zonedToInstant(e.eventDate, `${b.from}:00`, tz).getTime();
      const end = zonedToInstant(e.eventDate, `${b.to}:00`, tz).getTime();
      if (end <= start) throw new ConflictException('The end time must be after the start time');
      const step = b.durationMinutes * 60_000;
      const count = Math.floor((end - start) / step);
      if (count < 1) throw new ConflictException('The time range is shorter than one slot');
      if (count > MAX_SLOTS_PER_CALL) throw new ConflictException(`Add at most ${MAX_SLOTS_PER_CALL} slots at a time`);
      const rows = Array.from({ length: count }, (_, i) => ({ tenantId: p.tenantId, eventId: id, teacherId, startsAt: new Date(start + i * step), endsAt: new Date(start + (i + 1) * step) }));
      const made = await tx.insert(ptmSlots).values(rows).onConflictDoNothing().returning();
      await auditUser(tx, p, 'ptm.slots_added', 'ptm_event', id, { teacherId, count: made.length });
      return { created: made.length, skipped: count - made.length };
    });
  }

  /**
   * Slots of a meeting. Staff see everything with who booked. A guardian passes `studentId` and sees
   * only the free slots of that child's teachers plus the child's own bookings.
   */
  @Get('events/:id/slots')
  @Auth('user', ['tenant_admin', 'principal', 'hod', 'teacher', 'guardian'])
  slots(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('studentId') studentId?: string, @Query('teacherId') teacherId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.event(tx, id);
      const staff = hasAny(p, ['tenant_admin', 'principal', 'hod', 'teacher']);
      const base = () =>
        tx
          .select({ slot: ptmSlots, teacher: users.fullName, student: students.fullName })
          .from(ptmSlots)
          .innerJoin(users, eq(users.id, ptmSlots.teacherId))
          .leftJoin(students, eq(students.id, ptmSlots.studentId))
          .$dynamic();
      if (staff && !(hasRole(p, ['guardian']) && studentId)) {
        const mineOnly = !hasAny(p, ['tenant_admin', 'principal', 'hod']);
        const rows = await base()
          .where(and(eq(ptmSlots.eventId, id), mineOnly ? eq(ptmSlots.teacherId, p.userId) : teacherId ? eq(ptmSlots.teacherId, teacherId) : undefined))
          .orderBy(asc(ptmSlots.teacherId), asc(ptmSlots.startsAt));
        return rows.map((r) => ({ ...r.slot, teacher: r.teacher, student: r.student }));
      }
      if (!studentId) throw new ConflictException('Choose a child');
      const child = await this.svc.guardianChild(tx, p, studentId);
      const teaching = await tx.select({ id: timetableSlots.teacherId }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, child.sectionId), isNull(timetableSlots.archivedAt)));
      const teacherIds = [...new Set(teaching.map((t) => t.id))];
      if (teacherIds.length === 0) return [];
      const rows = await base()
        .where(and(eq(ptmSlots.eventId, id), inArray(ptmSlots.teacherId, teacherIds), teacherId ? eq(ptmSlots.teacherId, teacherId) : undefined))
        .orderBy(asc(ptmSlots.teacherId), asc(ptmSlots.startsAt));
      return rows
        .filter((r) => !r.slot.studentId || r.slot.studentId === studentId)
        .map((r) => ({ ...r.slot, teacher: r.teacher, student: r.slot.studentId ? r.student : null, mine: r.slot.studentId === studentId }));
    });
  }

  /** The signed-in guardian's bookings across their children. */
  @Get('my-bookings')
  @Auth('user', ['guardian'])
  myBookings(@CurrentPrincipal() p: UserPrincipal, @Query('eventId') eventId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ slot: ptmSlots, teacher: users.fullName, student: students.fullName, title: ptmEvents.title })
        .from(ptmSlots)
        .innerJoin(guardians, and(eq(guardians.studentId, ptmSlots.studentId), eq(guardians.userId, p.userId)))
        .innerJoin(users, eq(users.id, ptmSlots.teacherId))
        .innerJoin(students, eq(students.id, ptmSlots.studentId))
        .innerJoin(ptmEvents, eq(ptmEvents.id, ptmSlots.eventId))
        .where(and(isNotNull(ptmSlots.studentId), eventId ? eq(ptmSlots.eventId, eventId) : undefined))
        .orderBy(asc(ptmSlots.startsAt));
      return rows.map((r) => ({ ...r.slot, teacher: r.teacher, student: r.student, event: r.title }));
    });
  }

  // ---- booking (guardians) --------------------------------------------------------------------

  private async lockSlot(tx: Tx, id: string): Promise<Slot> {
    return found((await tx.select().from(ptmSlots).where(eq(ptmSlots.id, id)).for('update'))[0], 'Slot');
  }

  /** Writes the booking, after the rules: slot free, one slot per child per teacher. */
  private async take(tx: Tx, p: UserPrincipal, slot: Slot, studentId: string) {
    if (slot.studentId) throw new ConflictException('This slot has just been booked. Choose another.');
    const [dup] = await tx.select({ id: ptmSlots.id }).from(ptmSlots).where(and(eq(ptmSlots.eventId, slot.eventId), eq(ptmSlots.teacherId, slot.teacherId), eq(ptmSlots.studentId, studentId)));
    if (dup) throw new ConflictException('This child already has a slot with that teacher');
    const [row] = await tx.update(ptmSlots).set({ studentId, bookedBy: p.userId, bookedAt: this.svc.now(), reminderSentAt: null }).where(eq(ptmSlots.id, slot.id)).returning();
    return row;
  }

  @Post('slots/:id/book')
  @Auth('user', ['guardian'])
  book(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(BookBody)) b: z.infer<typeof BookBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const child = await this.svc.guardianChild(tx, p, b.studentId);
      const slot = await this.lockSlot(tx, id);
      await this.openEvent(tx, slot.eventId);
      const row = await this.take(tx, p, slot, child.id);
      await auditUser(tx, p, 'ptm.slot_booked', 'ptm_slot', id, { studentId: child.id });
      await this.svc.notify(tx, [slot.teacherId], 'calendar', 'A parent booked a meeting', `${child.fullName}'s family booked ${slot.startsAt.toISOString()}`, `ptm:book:${id}:${child.id}`, { slotId: id });
      return row;
    });
  }

  /** Frees a booking. The family that booked, the teacher and the organisers can cancel. */
  @Post('slots/:id/cancel')
  @HttpCode(200)
  @Auth('user', ['guardian', 'teacher', 'hod', 'principal', 'tenant_admin'])
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const slot = await this.lockSlot(tx, id);
      if (!slot.studentId) throw new ConflictException('This slot is not booked');
      const studentId = slot.studentId;
      const family = hasRole(p, ['guardian']) && (await this.svc.guardiansOf(tx, studentId)).includes(p.userId);
      if (!family && slot.teacherId !== p.userId && !hasAny(p, PTM_ORGANISERS)) throw new NotFoundException('Slot not found');
      const [row] = await tx.update(ptmSlots).set({ studentId: null, bookedBy: null, bookedAt: null, reminderSentAt: null }).where(eq(ptmSlots.id, id)).returning();
      await auditUser(tx, p, 'ptm.slot_cancelled', 'ptm_slot', id, { studentId });
      const by = family ? [slot.teacherId] : await this.svc.guardiansOf(tx, studentId);
      await this.svc.notify(tx, by, 'calendar', 'A meeting was cancelled', slot.startsAt.toISOString(), `ptm:cancel:${id}:${studentId}:${this.svc.now().getTime()}`, { slotId: id });
      return row;
    });
  }

  /** Moves a booking to another free slot of the same teacher in the same meeting. */
  @Post('slots/:id/reschedule')
  @HttpCode(200)
  @Auth('user', ['guardian'])
  reschedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RescheduleBody)) b: z.infer<typeof RescheduleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ids = [id, b.toSlotId].sort();
      const locked = await tx.select().from(ptmSlots).where(inArray(ptmSlots.id, ids)).orderBy(asc(ptmSlots.id)).for('update');
      const from = locked.find((s) => s.id === id);
      const to = locked.find((s) => s.id === b.toSlotId);
      if (!from?.studentId) throw new NotFoundException('Booking not found');
      const child = await this.svc.guardianChild(tx, p, from.studentId);
      if (!to || to.eventId !== from.eventId || to.teacherId !== from.teacherId) throw new ConflictException('Choose another slot of the same teacher');
      await this.openEvent(tx, from.eventId);
      if (to.studentId) throw new ConflictException('This slot has just been booked. Choose another.');
      await tx.update(ptmSlots).set({ studentId: null, bookedBy: null, bookedAt: null, reminderSentAt: null }).where(eq(ptmSlots.id, id));
      const row = await this.take(tx, p, to, child.id);
      await auditUser(tx, p, 'ptm.slot_rescheduled', 'ptm_slot', row.id, { studentId: child.id, from: id });
      await this.svc.notify(tx, [to.teacherId], 'calendar', 'A meeting was moved', `${child.fullName}'s family moved to ${to.startsAt.toISOString()}`, `ptm:move:${row.id}:${child.id}`, { slotId: row.id });
      return row;
    });
  }

  // ---- teachers -------------------------------------------------------------------------------

  /** A teacher's own bookings for a meeting, in time order. */
  @Get('events/:id/my-schedule')
  @Auth('user', PTM_TEACHERS)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.event(tx, id);
      const rows = await tx
        .select({ slot: ptmSlots, student: students.fullName, rollNo: students.rollNo })
        .from(ptmSlots)
        .leftJoin(students, eq(students.id, ptmSlots.studentId))
        .where(and(eq(ptmSlots.eventId, id), eq(ptmSlots.teacherId, p.userId)))
        .orderBy(asc(ptmSlots.startsAt));
      return rows.map((r) => ({ ...r.slot, student: r.student, rollNo: r.rollNo }));
    });
  }

  /** Reminds families with an upcoming booking. A teacher reminds their own; organisers remind everyone. Sent once per booking. */
  @Post('events/:id/remind')
  @HttpCode(200)
  @Auth('user', [...PTM_ORGANISERS, ...PTM_TEACHERS])
  remind(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.openEvent(tx, id);
      const all = hasAny(p, PTM_ORGANISERS);
      const rows = await tx
        .select({ slot: ptmSlots, teacher: users.fullName, student: students.fullName })
        .from(ptmSlots)
        .innerJoin(users, eq(users.id, ptmSlots.teacherId))
        .innerJoin(students, eq(students.id, ptmSlots.studentId))
        .where(and(eq(ptmSlots.eventId, id), isNotNull(ptmSlots.studentId), isNull(ptmSlots.reminderSentAt), all ? undefined : eq(ptmSlots.teacherId, p.userId)))
        .for('update', { of: ptmSlots });
      for (const r of rows) {
        const family = await this.svc.guardiansOf(tx, r.slot.studentId as string);
        await this.svc.notify(tx, family, 'calendar', 'Parent-teacher meeting reminder', `${e.title}: ${r.student} meets ${r.teacher} at ${r.slot.startsAt.toISOString()}`, `ptm:remind:${r.slot.id}:${r.slot.studentId}`, { slotId: r.slot.id });
        await tx.update(ptmSlots).set({ reminderSentAt: this.svc.now() }).where(eq(ptmSlots.id, r.slot.id));
      }
      await auditUser(tx, p, 'ptm.reminders_sent', 'ptm_event', id, { count: rows.length });
      return { reminded: rows.length };
    });
  }
}
