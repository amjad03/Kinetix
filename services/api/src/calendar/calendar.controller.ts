import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { calendarEventRsvps } from '../db/schema-comms.js';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { hashKioskPin, KIOSK_PIN, kioskPinParts } from '../common/kiosk-pin.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { calendarEvents, guardians, notifications, programs, sections, students, teacherSubstitutions, tenants, timetableSlots, users, type TenantSettings } from '../db/schema.js';
import { specialClasses } from '../db/schema-academic-ops.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { texts } from '../notifications/texts.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addDays, parseDate } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const EventBody = z
  .object({
    kind: z.enum(['holiday', 'exam', 'event']),
    title: z.string().trim().min(1).max(160),
    startsOn: DATE,
    endsOn: DATE,
    /** Omit or null for the whole institution. */
    programIds: z.array(z.uuid()).min(1).max(100).nullable().optional(),
    /** Narrower audiences: a campus, classes or departments (omit for no narrowing). */
    campusIds: z.array(z.uuid()).min(1).max(50).nullable().optional(),
    sectionIds: z.array(z.uuid()).min(1).max(200).nullable().optional(),
    departmentIds: z.array(z.uuid()).min(1).max(50).nullable().optional(),
    /** Tell families and students (default: yes). */
    notify: z.boolean().optional(),
    /** A draft is seen by staff only until published (default: published). */
    draft: z.boolean().optional(),
    /** Ask the audience to reply going, maybe or not going, until `rsvpBy`, for up to `capacity` places (guests count). */
    rsvp: z.boolean().default(false),
    rsvpBy: DATE.nullable().default(null),
    capacity: z.number().int().min(1).max(100_000).nullable().default(null),
    venue: z.string().trim().max(160).default(''),
  })
  .refine((b) => b.startsOn <= b.endsOn, { message: 'The last day must be on or after the first day', path: ['endsOn'] })
  .refine((b) => !b.rsvpBy || b.rsvpBy <= b.endsOn, { message: 'Replies must close by the last day of the event', path: ['rsvpBy'] });
const RsvpBody = z.object({ response: z.enum(['going', 'maybe', 'not_going']), guests: z.number().int().min(0).max(10).default(0), note: z.string().trim().max(200).default('') });

const PublishBody = z.object({ ids: z.array(z.uuid()).min(1).max(500), publish: z.boolean().default(true), notify: z.boolean().optional() });

/** Longest range one request lists (a whole academic year and a bit). */
const MAX_DAYS = 400;

/**
 * The academic calendar: holidays (no classes), exam days and events. Everyone signed in
 * reads it; families and students see what applies to their classes. The principal and the
 * administrator keep it; a new or changed entry is announced to families and students.
 */
@Controller('v1/calendar')
export class CalendarController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
  ) {}

  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query('from') fromQ?: string, @Query('to') toQ?: string, @Query('campusId') campusId?: string, @Query('sectionId') sectionId?: string, @Query('departmentId') departmentId?: string, @Query('programId') programId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      const from = fromQ ? parseDate(fromQ, 'from') : today;
      const to = toQ ? parseDate(toQ, 'to') : addDays(from, 90);
      if (from > to) throw new BadRequestException('from must be on or before to');
      if (addDays(from, MAX_DAYS) < to) throw new BadRequestException(`Choose at most ${MAX_DAYS} days`);
      const rows = await listBetween(tx, from, to);
      const mine = await familyPrograms(tx, p);
      const mySections = mine === null ? null : await familySections(tx, p);
      // Calendars by audience: institution-wide entries always show; a narrowed entry shows when the asked-for campus, class, department or programme is one of its audiences.
      const hit = (ids: string[] | null, want?: string) => !want || ids === null || ids.includes(want);
      const visible = rows
        // Drafts are for staff until they are published.
        .filter((e) => mine === null || e.published)
        .filter((e) => (mine === null ? true : e.programIds === null || e.programIds.some((id) => mine.includes(id))))
        .filter((e) => (mySections === null || e.sectionIds === null ? true : e.sectionIds.some((id) => mySections.includes(id))))
        .filter((e) => hit(e.campusIds, campusId) && hit(e.sectionIds, sectionId) && hit(e.departmentIds, departmentId) && hit(e.programIds, programId));
      const mineRsvp = await myRsvps(tx, p.userId, visible.filter((e) => e.rsvp).map((e) => e.id));
      return { from, to, today, events: visible.map((e) => (e.rsvp ? { ...e, myRsvp: mineRsvp.get(e.id) ?? null } : e)) };
    });
  }

  /** Replies to an event that asks for RSVPs (or changes the reply until replies close). Places are counted with guests. */
  @Post(':id/rsvp')
  @HttpCode(200)
  @Auth('user')
  rsvp(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RsvpBody)) b: z.infer<typeof RsvpBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.select().from(calendarEvents).where(eq(calendarEvents.id, id)).for('update');
      if (!e || !(await visibleTo(tx, p, e))) throw new NotFoundException('Calendar entry not found');
      if (!e.rsvp) throw new BadRequestException('This event does not ask for replies');
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      if (today > (e.rsvpBy ?? e.endsOn)) throw new ConflictException('Replies for this event have closed');
      const guests = b.response === 'not_going' ? 0 : b.guests;
      if (e.capacity && b.response === 'going') {
        const [taken] = await tx
          .select({ n: sql<number>`coalesce(sum(1 + ${calendarEventRsvps.guests}), 0)::int` })
          .from(calendarEventRsvps)
          .where(and(eq(calendarEventRsvps.eventId, id), eq(calendarEventRsvps.response, 'going'), ne(calendarEventRsvps.userId, p.userId)));
        if (taken.n + 1 + guests > e.capacity) throw new ConflictException(`Only ${Math.max(0, e.capacity - taken.n)} place(s) are left`);
      }
      const now = this.clock.now();
      await tx
        .insert(calendarEventRsvps)
        .values({ tenantId: p.tenantId, eventId: id, userId: p.userId, response: b.response, guests, note: b.note })
        .onConflictDoUpdate({ target: [calendarEventRsvps.eventId, calendarEventRsvps.userId], set: { response: b.response, guests, note: b.note, updatedAt: now } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'calendar.rsvp', subjectType: 'calendar_event', subjectId: id, data: { response: b.response, guests } });
      return { eventId: id, ...(await rsvpCounts(tx, [id])).get(id), myRsvp: { response: b.response, guests, note: b.note } };
    });
  }
}

/** The caller's reply per event. */
async function myRsvps(tx: Tx, userId: string, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, { response: string; guests: number; note: string }>();
  const rows = await tx.select({ eventId: calendarEventRsvps.eventId, response: calendarEventRsvps.response, guests: calendarEventRsvps.guests, note: calendarEventRsvps.note }).from(calendarEventRsvps).where(and(eq(calendarEventRsvps.userId, userId), inArray(calendarEventRsvps.eventId, eventIds)));
  return new Map(rows.map((r) => [r.eventId, { response: r.response, guests: r.guests, note: r.note }]));
}

/** Replies per event: going (people and places with guests), maybe, not going. */
export async function rsvpCounts(tx: Tx, eventIds: string[]) {
  const out = new Map<string, { going: number; places: number; maybe: number; notGoing: number }>();
  if (!eventIds.length) return out;
  const rows = await tx
    .select({
      eventId: calendarEventRsvps.eventId,
      going: sql<number>`count(*) filter (where ${calendarEventRsvps.response} = 'going')::int`,
      places: sql<number>`coalesce(sum(1 + ${calendarEventRsvps.guests}) filter (where ${calendarEventRsvps.response} = 'going'), 0)::int`,
      maybe: sql<number>`count(*) filter (where ${calendarEventRsvps.response} = 'maybe')::int`,
      notGoing: sql<number>`count(*) filter (where ${calendarEventRsvps.response} = 'not_going')::int`,
    })
    .from(calendarEventRsvps)
    .where(inArray(calendarEventRsvps.eventId, eventIds))
    .groupBy(calendarEventRsvps.eventId);
  for (const id of eventIds) out.set(id, { going: 0, places: 0, maybe: 0, notGoing: 0 });
  for (const r of rows) out.set(r.eventId, { going: r.going, places: r.places, maybe: r.maybe, notGoing: r.notGoing });
  return out;
}

/** Whether the person sees the entry in their calendar (the same rules as the list). */
async function visibleTo(tx: Tx, p: UserPrincipal, e: typeof calendarEvents.$inferSelect): Promise<boolean> {
  const mine = await familyPrograms(tx, p);
  if (mine === null) return true;
  if (!e.published) return false;
  if (e.programIds !== null && !e.programIds.some((id) => mine.includes(id))) return false;
  if (e.sectionIds === null) return true;
  const secs = await familySections(tx, p);
  return e.sectionIds.some((id) => secs.includes(id));
}

/** Every entry overlapping [from, to], with program names. */
async function listBetween(tx: Tx, from: string, to: string) {
  const rows = await tx
    .select({
      id: calendarEvents.id,
      kind: calendarEvents.kind,
      title: calendarEvents.title,
      startsOn: calendarEvents.startsOn,
      endsOn: calendarEvents.endsOn,
      programIds: calendarEvents.programIds,
      campusIds: calendarEvents.campusIds,
      sectionIds: calendarEvents.sectionIds,
      departmentIds: calendarEvents.departmentIds,
      source: calendarEvents.source,
      published: calendarEvents.published,
      rsvp: calendarEvents.rsvp,
      rsvpBy: calendarEvents.rsvpBy,
      capacity: calendarEvents.capacity,
      venue: calendarEvents.venue,
    })
    .from(calendarEvents)
    .where(and(lte(calendarEvents.startsOn, to), gte(calendarEvents.endsOn, from)))
    .orderBy(asc(calendarEvents.startsOn), asc(calendarEvents.title));
  const ids = [...new Set(rows.flatMap((r) => r.programIds ?? []))];
  const names = ids.length ? new Map((await tx.select({ id: programs.id, name: programs.name }).from(programs).where(inArray(programs.id, ids))).map((r) => [r.id, r.name])) : new Map<string, string>();
  const counts = await rsvpCounts(tx, rows.filter((r) => r.rsvp).map((r) => r.id));
  return rows.map((r) => ({ ...r, programs: r.programIds?.map((id) => names.get(id) ?? '') ?? null, ...(r.rsvp ? { replies: counts.get(r.id) } : {}) }));
}

/** Classes of a family's children or a student's own class. */
async function familySections(tx: Tx, p: UserPrincipal): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ sectionId: students.sectionId })
    .from(students)
    .leftJoin(guardians, eq(guardians.studentId, students.id))
    .where(and(eq(students.status, 'active'), p.roles.includes('student') ? eq(students.userId, p.userId) : eq(guardians.userId, p.userId)));
  return rows.map((r) => r.sectionId);
}

/** Programs of a family's children or a student's own class; null for staff (they see everything). */
export async function familyPrograms(tx: Tx, p: UserPrincipal): Promise<string[] | null> {
  const family = p.roles.every((r) => r === 'guardian' || r === 'student');
  if (!family) return null;
  const rows = await tx
    .selectDistinct({ programId: sections.programId })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .leftJoin(guardians, eq(guardians.studentId, students.id))
    .where(and(eq(students.status, 'active'), p.roles.includes('student') ? eq(students.userId, p.userId) : eq(guardians.userId, p.userId)));
  return rows.map((r) => r.programId);
}

@Controller('v1/admin/calendar')
export class CalendarAdminController {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBus,
  ) {}

  /**
   * What a published entry changes elsewhere: a holiday cancels the substitutions arranged and the special classes
   * planned for its days (their teachers are told) and counts the timetable periods that will not meet; every published
   * entry is announced as a domain event for other modules.
   */
  private async propagate(tx: Tx, p: UserPrincipal, e: typeof calendarEvents.$inferSelect) {
    let periods = 0;
    let substitutions = 0;
    let special = 0;
    if (e.kind === 'holiday') {
      const inScope = (programId: string) => e.programIds === null || e.programIds.includes(programId);
      const subs = await tx
        .select({ id: teacherSubstitutions.id, teacherId: teacherSubstitutions.substituteTeacherId, programId: sections.programId, date: teacherSubstitutions.date })
        .from(teacherSubstitutions)
        .innerJoin(timetableSlots, eq(timetableSlots.id, teacherSubstitutions.slotId))
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .where(and(eq(teacherSubstitutions.status, 'assigned'), gte(teacherSubstitutions.date, e.startsOn), lte(teacherSubstitutions.date, e.endsOn)));
      const cancelSubs = subs.filter((x) => inScope(x.programId) && e.sectionIds === null);
      if (cancelSubs.length) await tx.update(teacherSubstitutions).set({ status: 'cancelled' }).where(inArray(teacherSubstitutions.id, cancelSubs.map((x) => x.id)));
      substitutions = cancelSubs.length;
      const sc = await tx
        .select({ id: specialClasses.id, teacherId: specialClasses.teacherId, programId: sections.programId, sectionId: specialClasses.sectionId })
        .from(specialClasses)
        .innerJoin(sections, eq(sections.id, specialClasses.sectionId))
        .where(and(eq(specialClasses.status, 'scheduled'), gte(specialClasses.date, e.startsOn), lte(specialClasses.date, e.endsOn)));
      const cancelSc = sc.filter((x) => inScope(x.programId) && (e.sectionIds === null || e.sectionIds.includes(x.sectionId)));
      if (cancelSc.length) await tx.update(specialClasses).set({ status: 'cancelled' }).where(inArray(specialClasses.id, cancelSc.map((x) => x.id)));
      special = cancelSc.length;
      // Weekly periods that fall on the holiday's days.
      const slots = await tx.select({ dayOfWeek: timetableSlots.dayOfWeek, programId: sections.programId, teacherId: timetableSlots.teacherId }).from(timetableSlots).innerJoin(sections, eq(sections.id, timetableSlots.sectionId)).where(isNull(timetableSlots.archivedAt));
      const days: number[] = [];
      for (let d = e.startsOn; d <= e.endsOn; d = addDays(d, 1)) days.push(new Date(`${d}T00:00:00Z`).getUTCDay() || 7);
      const hit = slots.filter((x) => inScope(x.programId));
      periods = days.reduce((n, wd) => n + hit.filter((x) => x.dayOfWeek === wd).length, 0);
      const teachers = [...new Set([...cancelSubs.map((x) => x.teacherId), ...cancelSc.map((x) => x.teacherId)])];
      if (teachers.length)
        await this.notifications.notifyUsers(tx, teachers, { kind: 'calendar', text: texts.calendar(e), data: { calendarEventId: e.id, startsOn: e.startsOn }, dedupeKey: `calendar-staff:${e.id}` }, { replace: true });
    }
    await this.events.emit(tx, p.tenantId, { type: DomainEvents.CalendarPublished, aggregateType: 'calendar_event', aggregateId: e.id, actorId: p.userId, payload: { kind: e.kind, startsOn: e.startsOn, endsOn: e.endsOn, programIds: e.programIds, periodsAffected: periods, substitutionsCancelled: substitutions, specialClassesCancelled: special } });
    return { periodsAffected: periods, substitutionsCancelled: substitutions, specialClassesCancelled: special };
  }

  @Post()
  @Auth('user', STAFF_ADMIN_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EventBody)) b: z.infer<typeof EventBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertPrograms(tx, b.programIds);
      const [e] = await tx
        .insert(calendarEvents)
        .values({ tenantId: p.tenantId, kind: b.kind, title: b.title, startsOn: b.startsOn, endsOn: b.endsOn, programIds: b.programIds ?? null, campusIds: b.campusIds ?? null, sectionIds: b.sectionIds ?? null, departmentIds: b.departmentIds ?? null, published: !b.draft, createdBy: p.userId, rsvp: b.rsvp, rsvpBy: b.rsvp ? b.rsvpBy : null, capacity: b.rsvp ? b.capacity : null, venue: b.venue })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'calendar.created', subjectType: 'calendar_event', subjectId: e.id, data: { kind: e.kind, title: e.title, startsOn: e.startsOn, endsOn: e.endsOn, draft: !e.published } });
      if (b.notify !== false && e.published) await this.notifications.calendarEvent(tx, e);
      const effect = e.published ? await this.propagate(tx, p, e) : null;
      return { ...e, effect };
    });
  }

  @Put(':id')
  @Auth('user', STAFF_ADMIN_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EventBody)) b: z.infer<typeof EventBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertPrograms(tx, b.programIds);
      const [e] = await tx
        .update(calendarEvents)
        .set({ kind: b.kind, title: b.title, startsOn: b.startsOn, endsOn: b.endsOn, programIds: b.programIds ?? null, campusIds: b.campusIds ?? null, sectionIds: b.sectionIds ?? null, departmentIds: b.departmentIds ?? null, rsvp: b.rsvp, rsvpBy: b.rsvp ? b.rsvpBy : null, capacity: b.rsvp ? b.capacity : null, venue: b.venue })
        .where(eq(calendarEvents.id, id))
        .returning();
      if (!e) throw new NotFoundException('Calendar entry not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'calendar.updated', subjectType: 'calendar_event', subjectId: id, data: { kind: e.kind, title: e.title, startsOn: e.startsOn, endsOn: e.endsOn } });
      // The same notification is updated in place (it is keyed by the entry); drafts tell nobody yet.
      if (b.notify !== false && e.published) await this.notifications.calendarEvent(tx, e);
      const effect = e.published ? await this.propagate(tx, p, e) : null;
      return { ...e, effect };
    });
  }

  /** Publishes draft entries to students and families (and tells them), or takes entries back to draft. */
  @Post('publish')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  publish(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PublishBody)) b: z.infer<typeof PublishBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.update(calendarEvents).set({ published: b.publish }).where(and(inArray(calendarEvents.id, b.ids), eq(calendarEvents.published, !b.publish))).returning();
      for (const e of rows) {
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.publish ? 'calendar.published' : 'calendar.unpublished', subjectType: 'calendar_event', subjectId: e.id, changes: { published: { before: !b.publish, after: b.publish } } });
        if (b.publish && b.notify !== false) await this.notifications.calendarEvent(tx, e);
        if (b.publish) await this.propagate(tx, p, e);
        if (!b.publish) await tx.update(notifications).set({ retractedAt: new Date() }).where(and(eq(notifications.dedupeKey, `calendar:${e.id}`), isNull(notifications.retractedAt)));
      }
      return { changed: rows.length };
    });
  }

  /** Who replied to an event, with the totals; `?response=going|maybe|not_going`. Staff who run events read it. */
  @Get(':id/rsvps')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'hod', 'teacher'])
  rsvps(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('response') response?: string) {
    const r = response ? z.enum(['going', 'maybe', 'not_going']).parse(response) : undefined;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.select().from(calendarEvents).where(eq(calendarEvents.id, id));
      if (!e) throw new NotFoundException('Calendar entry not found');
      const rows = await tx
        .select({ userId: users.id, fullName: users.fullName, response: calendarEventRsvps.response, guests: calendarEventRsvps.guests, note: calendarEventRsvps.note, at: calendarEventRsvps.updatedAt, roles: sql<string[]>`(select array_agg(distinct x.role::text) from user_roles x where x.user_id = ${users.id})` })
        .from(calendarEventRsvps)
        .innerJoin(users, eq(users.id, calendarEventRsvps.userId))
        .where(and(eq(calendarEventRsvps.eventId, id), r ? eq(calendarEventRsvps.response, r) : undefined))
        .orderBy(asc(users.fullName))
        .limit(5000);
      return { event: { id: e.id, title: e.title, startsOn: e.startsOn, endsOn: e.endsOn, rsvp: e.rsvp, rsvpBy: e.rsvpBy, capacity: e.capacity, venue: e.venue }, totals: (await rsvpCounts(tx, [id])).get(id), rows };
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @Auth('user', STAFF_ADMIN_ROLES)
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning();
      if (!e) throw new NotFoundException('Calendar entry not found');
      // Families no longer see an announcement for a holiday that was cancelled.
      await tx.update(notifications).set({ retractedAt: new Date() }).where(and(eq(notifications.dedupeKey, `calendar:${id}`), isNull(notifications.retractedAt)));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'calendar.deleted', subjectType: 'calendar_event', subjectId: id, data: { title: e.title, startsOn: e.startsOn } });
    });
  }
}

async function assertPrograms(tx: Tx, ids: string[] | null | undefined) {
  if (!ids?.length) return;
  const found = await tx.select({ id: programs.id }).from(programs).where(inArray(programs.id, ids));
  if (found.length !== new Set(ids).size) throw new BadRequestException('Some programs were not found');
}

/** Days lesson recordings are kept after their term ends, unless the institution says otherwise. */
export const DEFAULT_RETENTION_GRACE_DAYS = 7;

const SettingsBody = z
  .object({
    liveViewEnabled: z.boolean(),
    liveViewIndicator: z.boolean(),
    classroomAudioToViewers: z.boolean(),
    pinFallbackEnabled: z.boolean(),
    grievanceOfficer: z
      .object({ name: z.string().trim().min(1).max(120), email: z.email().optional(), phone: z.string().trim().max(20).optional() })
      .nullable(),
    recordingRetentionGraceDays: z.number().int().min(0).max(90),
    /** Hours after a day ends when its attendance locks; null = never. */
    attendanceLockHours: z.number().int().min(0).max(720).nullable(),
    attendanceThresholdPct: z.number().int().min(1).max(100),
    boardTraining: z.object({ url: z.url().max(500).nullable().optional(), contact: z.string().trim().max(200).nullable().optional() }).strict().nullable(),
    /** A school server with the 3D model files (packages/zynetix_3d/remote_models); null = this API. */
    boardModelsBase: z.url({ protocol: /^https?$/ }).max(500).nullable(),
    boardWhatsNew: z.array(z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().max(1000), at: z.iso.date() })).max(30),
    /** Kiosk mode on boards. `pin` sets the IT PIN (4–8 digits; only its hash is kept) or removes it (null). */
    boardKiosk: z
      .object({ enabled: z.boolean(), pin: z.string().regex(KIOSK_PIN, 'The PIN must be 4 to 8 digits').nullable() })
      .partial()
      .strict()
      .refine((k) => k.enabled !== undefined || k.pin !== undefined, 'Nothing to change'),
  })
  .partial()
  .strict();

/** Institution settings: live view, the "being viewed" sign, class audio for leaders, PIN fallback, recording retention, board kiosk mode. */
@Controller('v1/admin/settings')
export class SettingsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get()
  @Auth('user', STAFF_ADMIN_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => withDefaults((await tx.select({ settings: tenants.settings }).from(tenants))[0]?.settings ?? {}));
  }

  @Put()
  @Auth('user', STAFF_ADMIN_ROLES)
  put(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select({ settings: tenants.settings }).from(tenants);
      const before = t?.settings ?? {};
      const { boardKiosk: kiosk, ...rest } = b;
      const settings: TenantSettings = { ...before, ...rest };
      const changed: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([k, v]) => before[k as keyof TenantSettings] !== v));
      if (kiosk) {
        const prev = { enabled: before.boardKiosk?.enabled ?? true, pinHash: before.boardKiosk?.pinHash ?? null, pinSetAt: before.boardKiosk?.pinSetAt ?? null };
        const next = { ...prev, ...(kiosk.enabled !== undefined ? { enabled: kiosk.enabled } : {}) };
        if (kiosk.pin !== undefined) {
          next.pinHash = kiosk.pin === null ? null : hashKioskPin(kiosk.pin);
          next.pinSetAt = kiosk.pin === null ? null : this.clock.now().toISOString();
        }
        settings.boardKiosk = next;
        // Never the PIN or its hash: only that it was set or removed.
        const kioskChanged = { ...(next.enabled !== prev.enabled ? { enabled: next.enabled } : {}), ...(kiosk.pin !== undefined ? { pin: kiosk.pin === null ? 'removed' : 'set' } : {}) };
        if (Object.keys(kioskChanged).length) changed.boardKiosk = kioskChanged;
      }
      await tx.update(tenants).set({ settings }).where(eq(tenants.id, p.tenantId));
      if (Object.keys(changed).length) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'settings.updated', subjectType: 'tenant', subjectId: p.tenantId, data: changed });
      return withDefaults(settings);
    });
  }
}

/** The values in force, with the defaults the rest of the API uses. */
function withDefaults(s: TenantSettings) {
  return {
    liveViewEnabled: s.liveViewEnabled ?? false,
    liveViewIndicator: s.liveViewIndicator ?? true,
    classroomAudioToViewers: s.classroomAudioToViewers ?? false,
    pinFallbackEnabled: s.pinFallbackEnabled ?? false,
    grievanceOfficer: s.grievanceOfficer ?? null,
    attendanceLockHours: s.attendanceLockHours ?? null,
    attendanceThresholdPct: s.attendanceThresholdPct ?? 75,
    recordingRetentionGraceDays: s.recordingRetentionGraceDays ?? DEFAULT_RETENTION_GRACE_DAYS,
    // The board profile's training link and the What's New announcements (Settings → Smartboard reads them back).
    boardTraining: s.boardTraining ?? null,
    boardWhatsNew: s.boardWhatsNew ?? [],
    boardModelsBase: s.boardModelsBase ?? null,
    // Whether an IT PIN is set, never the PIN or its hash.
    boardKiosk: { enabled: s.boardKiosk?.enabled ?? true, pinSet: kioskPinParts(s.boardKiosk?.pinHash) !== null, pinSetAt: s.boardKiosk?.pinSetAt ?? null },
  };
}

/**
 * What a board needs to run kiosk mode (GET /v1/devices/me/config): on or off, and the IT PIN's
 * salt and hash with the parameters to check a typed PIN offline. Never the PIN.
 */
export function boardKioskConfig(s: TenantSettings) {
  const pin = kioskPinParts(s.boardKiosk?.pinHash);
  return { enabled: s.boardKiosk?.enabled ?? true, algo: pin?.algo ?? null, iterations: pin?.iterations ?? null, pinSalt: pin?.salt ?? null, pinHash: pin?.hash ?? null };
}
