import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { calendarEvents, guardians, notifications, programs, sections, students, tenants, type TenantSettings } from '../db/schema.js';
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
    /** Tell families and students (default: yes). */
    notify: z.boolean().optional(),
  })
  .refine((b) => b.startsOn <= b.endsOn, { message: 'The last day must be on or after the first day', path: ['endsOn'] });

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
  list(@CurrentPrincipal() p: UserPrincipal, @Query('from') fromQ?: string, @Query('to') toQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      const from = fromQ ? parseDate(fromQ, 'from') : today;
      const to = toQ ? parseDate(toQ, 'to') : addDays(from, 90);
      if (from > to) throw new BadRequestException('from must be on or before to');
      if (addDays(from, MAX_DAYS) < to) throw new BadRequestException(`Choose at most ${MAX_DAYS} days`);
      const rows = await listBetween(tx, from, to);
      const mine = await familyPrograms(tx, p);
      return {
        from,
        to,
        today,
        events: mine === null ? rows : rows.filter((e) => e.programIds === null || e.programIds.some((id) => mine.includes(id))),
      };
    });
  }
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
    })
    .from(calendarEvents)
    .where(and(lte(calendarEvents.startsOn, to), gte(calendarEvents.endsOn, from)))
    .orderBy(asc(calendarEvents.startsOn), asc(calendarEvents.title));
  const ids = [...new Set(rows.flatMap((r) => r.programIds ?? []))];
  const names = ids.length ? new Map((await tx.select({ id: programs.id, name: programs.name }).from(programs).where(inArray(programs.id, ids))).map((r) => [r.id, r.name])) : new Map<string, string>();
  return rows.map((r) => ({ ...r, programs: r.programIds?.map((id) => names.get(id) ?? '') ?? null }));
}

/** Programs of a family's children or a student's own class; null for staff (they see everything). */
async function familyPrograms(tx: Tx, p: UserPrincipal): Promise<string[] | null> {
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
  ) {}

  @Post()
  @Auth('user', STAFF_ADMIN_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EventBody)) b: z.infer<typeof EventBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertPrograms(tx, b.programIds);
      const [e] = await tx
        .insert(calendarEvents)
        .values({ tenantId: p.tenantId, kind: b.kind, title: b.title, startsOn: b.startsOn, endsOn: b.endsOn, programIds: b.programIds ?? null, createdBy: p.userId })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'calendar.created', subjectType: 'calendar_event', subjectId: e.id, data: { kind: e.kind, title: e.title, startsOn: e.startsOn, endsOn: e.endsOn } });
      if (b.notify !== false) await this.notifications.calendarEvent(tx, e);
      return e;
    });
  }

  @Put(':id')
  @Auth('user', STAFF_ADMIN_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EventBody)) b: z.infer<typeof EventBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertPrograms(tx, b.programIds);
      const [e] = await tx
        .update(calendarEvents)
        .set({ kind: b.kind, title: b.title, startsOn: b.startsOn, endsOn: b.endsOn, programIds: b.programIds ?? null })
        .where(eq(calendarEvents.id, id))
        .returning();
      if (!e) throw new NotFoundException('Calendar entry not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'calendar.updated', subjectType: 'calendar_event', subjectId: id, data: { kind: e.kind, title: e.title, startsOn: e.startsOn, endsOn: e.endsOn } });
      // The same notification is updated in place (it is keyed by the entry).
      if (b.notify !== false) await this.notifications.calendarEvent(tx, e);
      return e;
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

const SettingsBody = z
  .object({
    liveViewEnabled: z.boolean(),
    liveViewIndicator: z.boolean(),
    classroomAudioToViewers: z.boolean(),
    pinFallbackEnabled: z.boolean(),
  })
  .partial()
  .strict();

/** Institution settings: live view, the "being viewed" sign, class audio for leaders, PIN fallback. */
@Controller('v1/admin/settings')
export class SettingsController {
  constructor(private readonly db: DbService) {}

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
      const settings: TenantSettings = { ...before, ...b };
      await tx.update(tenants).set({ settings }).where(eq(tenants.id, p.tenantId));
      const changed = Object.fromEntries(Object.entries(b).filter(([k, v]) => before[k as keyof TenantSettings] !== v));
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
  };
}
