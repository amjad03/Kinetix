import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { TIMETABLE_VERSION_STATUSES, timetableVersions, timetableVersionSlots } from '../db/schema-academics-pass.js';
import { academicYears, departments, rooms, sections, subjects, tenants, timetableSlots, users } from '../db/schema.js';
import { naturalCompare } from '../common/natural-order.js';
import { Time } from '../admin/timetable-rules.js';
import { StudioService, type SlotDraft } from './studio.service.js';
import { timetablePdf } from './timetable-pdf.js';

/** Who sees versions and their reports; who builds drafts; who publishes. */
export const STUDIO_READ: RoleName[] = [...STAFF_ADMIN_ROLES, 'hod'];
export const STUDIO_WRITE: RoleName[] = STAFF_ADMIN_ROLES;

const Settings = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
    periods: z.array(z.object({ startsAt: Time, endsAt: Time }).refine((p) => p.startsAt < p.endsAt, 'A period must end after it starts')).min(1).max(14).optional(),
    structureId: z.uuid().nullable().optional(),
    /** Subjects taught to two or more classes together. */
    combine: z.array(z.object({ subjectId: z.uuid(), sectionIds: z.array(z.uuid()).min(2).max(10) })).max(40).optional(),
    labBlockPeriods: z.number().int().min(1).max(4).optional(),
    maxPerDay: z.number().int().min(1).max(14).optional(),
    maxConsecutive: z.number().int().min(1).max(8).optional(),
  })
  .strict();

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  sectionIds: z.array(z.uuid()).min(1).max(60),
  /** generate: run the generator; copy: start from the live timetable; blank: an empty draft. */
  source: z.enum(['generate', 'copy', 'blank']).default('generate'),
  settings: Settings.default({}),
  notes: z.string().trim().max(2000).default(''),
});

const SlotBody = z
  .object({
    sectionId: z.uuid(),
    subjectId: z.uuid(),
    teacherId: z.uuid(),
    roomId: z.uuid().nullable().optional(),
    dayOfWeek: z.number().int().min(1).max(7),
    startsAt: Time,
    endsAt: Time,
    batch: z.string().trim().max(20).nullable().optional().transform((v) => v || null),
    combinedSectionIds: z.array(z.uuid()).max(10).nullable().optional(),
    kind: z.enum(['theory', 'tutorial', 'lab', 'elective']).default('theory'),
  })
  .refine((s) => s.startsAt < s.endsAt, { message: 'The period must end after it starts', path: ['endsAt'] });

/** A drag and drop: where the period goes (a lab block moves together), and optionally another room or teacher. */
const MoveBody = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startsAt: Time,
  roomId: z.uuid().nullable().optional(),
  teacherId: z.uuid().optional(),
  /** true: report the problems without moving. */
  dryRun: z.boolean().default(false),
});

const PublishBody = z.object({ effectiveFrom: z.iso.date().nullable().optional(), notify: z.boolean().default(true), note: z.string().trim().max(500).optional() });
const LockBody = z.object({ locked: z.boolean() });
const ListQuery = z.object({ status: z.enum(TIMETABLE_VERSION_STATUSES).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const ViewQuery = z.object({ by: z.enum(['class', 'teacher', 'room']).default('class'), id: z.uuid() });

const hhmm = (t: string) => t.slice(0, 5);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const timeOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * The timetable studio: versions of the timetable. A draft is generated under the institution's constraints (or copied
 * from the live timetable), edited by drag and drop with every clash shown, compared with the live timetable and
 * published; publishing keeps the old periods archived so attendance and recordings stay with what was taught.
 */
@Controller('v1/timetable-studio')
export class TimetableStudioController {
  constructor(
    private readonly db: DbService,
    private readonly svc: StudioService,
  ) {}

  @Get('versions')
  @Auth('user', STUDIO_READ)
  list(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string>) {
    const q = ListQuery.safeParse(raw);
    if (!q.success) throw new BadRequestException(q.error.issues[0]?.message ?? 'Check the filters');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const where = q.data.status ? eq(timetableVersions.status, q.data.status) : undefined;
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(timetableVersions).where(where);
      const rows = await tx
        .select({
          id: timetableVersions.id,
          versionNo: timetableVersions.versionNo,
          name: timetableVersions.name,
          status: timetableVersions.status,
          source: timetableVersions.source,
          sectionIds: timetableVersions.sectionIds,
          effectiveFrom: timetableVersions.effectiveFrom,
          createdAt: timetableVersions.createdAt,
          publishedAt: timetableVersions.publishedAt,
          createdBy: users.fullName,
          periods: sql<number>`(select count(*)::int from timetable_version_slots s where s.version_id = ${timetableVersions.id})`,
          unplaced: sql<number>`coalesce((select sum((u->>'missing')::int) from jsonb_array_elements(${timetableVersions.report}->'unplaced') u), 0)::int`,
        })
        .from(timetableVersions)
        .leftJoin(users, eq(users.id, timetableVersions.createdBy))
        .where(where)
        .orderBy(desc(timetableVersions.versionNo))
        .limit(q.data.pageSize)
        .offset((q.data.page - 1) * q.data.pageSize);
      const ids = [...new Set(rows.flatMap((r) => r.sectionIds))];
      const names = ids.length ? new Map((await tx.select({ id: sections.id, name: sections.displayName }).from(sections).where(inArray(sections.id, ids))).map((s) => [s.id, s.name])) : new Map<string, string>();
      return { rows: rows.map((r) => ({ ...r, classes: r.sectionIds.map((id) => names.get(id) ?? '').filter(Boolean).sort(naturalCompare) })), total, page: q.data.page, pageSize: q.data.pageSize };
    });
  }

  /** Starts a draft for some classes: generated under the constraints, copied from the live timetable, or empty. */
  @Post('versions')
  @Auth('user', STUDIO_WRITE)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const scope = await this.svc.scope(tx, b.sectionIds);
      for (const c of b.settings.combine ?? []) if (c.sectionIds.some((id) => !b.sectionIds.includes(id))) throw new BadRequestException('A combined class must be one of the version\'s classes');
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.id, scope[0].academicYearId));
      const [v] = await tx
        .insert(timetableVersions)
        .values({ tenantId: p.tenantId, academicYearId: year.id, versionNo: await this.svc.nextNo(tx), name: b.name, sectionIds: scope.map((s) => s.id), source: b.source === 'generate' ? 'generated' : b.source === 'copy' ? 'copy' : 'manual', settings: b.settings, notes: b.notes, createdBy: p.userId })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.version_created', subjectType: 'timetable_version', subjectId: v.id, after: { name: v.name, source: v.source, classes: scope.length } });
      if (b.source === 'copy') await this.svc.copyLive(tx, p, v.id, v.sectionIds);
      const report = b.source === 'generate' ? await this.svc.generate(tx, p, v.id) : null;
      return { ...(await this.svc.version(tx, v.id)), report };
    });
  }

  @Get('versions/:id')
  @Auth('user', STUDIO_READ)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.version(tx, id);
      const slots = await this.slotRows(tx, id);
      const scope = await tx.select({ id: sections.id, displayName: sections.displayName, programId: sections.programId, term: sections.term }).from(sections).where(inArray(sections.id, v.sectionIds));
      const bell = await this.svc.periodsFor(tx, scope[0]?.programId ?? '00000000-0000-0000-0000-000000000000', v.settings);
      const problems = v.status === 'draft' ? await this.svc.allProblems(tx, v) : [];
      return { ...v, classes: scope.sort((a, b) => naturalCompare(a.displayName, b.displayName)), days: bell.days, periods: bell.periods, slots, problems, diff: v.status === 'draft' ? await this.svc.diff(tx, v) : [], workload: await this.svc.workload(tx, v) };
    });
  }

  /** Runs the generator again; locked periods stay. */
  @Post('versions/:id/generate')
  @HttpCode(200)
  @Auth('user', STUDIO_WRITE)
  regenerate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ settings: Settings.default({}) }))) b: { settings: z.infer<typeof Settings> }) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.generate(tx, p, id, b.settings));
  }

  @Post('versions/:id/slots')
  @Auth('user', STUDIO_WRITE)
  addSlot(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SlotBody)) b: z.infer<typeof SlotBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.draft(tx, id);
      if (!v.sectionIds.includes(b.sectionId)) throw new BadRequestException('That class is not in this version');
      await this.checkRefs(tx, b);
      const problems = await this.svc.problems(tx, v, b);
      if (problems.length) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: problems[0].code, message: problems[0].message, problems });
      const [slot] = await tx.insert(timetableVersionSlots).values({ tenantId: p.tenantId, versionId: v.id, ...b, roomId: b.roomId ?? null, combinedSectionIds: b.combinedSectionIds?.length ? b.combinedSectionIds : null }).returning();
      await this.touch(tx, p, v.id, 'timetable.version_slot_added', { slotId: slot.id });
      return slot;
    });
  }

  /**
   * Moves a period (drag and drop). The periods of a lab block move together, keeping their length. With `dryRun`
   * the problems the move would cause are returned and nothing changes (the editor shows them while dragging).
   */
  @Patch('versions/:id/slots/:slotId')
  @Auth('user', STUDIO_WRITE)
  move(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('slotId', ParseUUIDPipe) slotId: string, @Body(new ZodBody(MoveBody)) b: z.infer<typeof MoveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.draft(tx, id);
      const [slot] = await tx.select().from(timetableVersionSlots).where(and(eq(timetableVersionSlots.id, slotId), eq(timetableVersionSlots.versionId, v.id)));
      if (!slot) throw new NotFoundException('Period not found');
      const group = slot.blockId ? await tx.select().from(timetableVersionSlots).where(and(eq(timetableVersionSlots.versionId, v.id), eq(timetableVersionSlots.blockId, slot.blockId))).orderBy(asc(timetableVersionSlots.startsAt)) : [slot];
      // Parallel elective options move together too: every option of the basket in that period.
      const members = slot.kind === 'elective' && slot.basketId ? await tx.select().from(timetableVersionSlots).where(and(eq(timetableVersionSlots.versionId, v.id), eq(timetableVersionSlots.basketId, slot.basketId), eq(timetableVersionSlots.dayOfWeek, slot.dayOfWeek), eq(timetableVersionSlots.startsAt, slot.startsAt))) : group;
      const bell = await this.svc.periodsFor(tx, (await tx.select({ programId: sections.programId }).from(sections).where(eq(sections.id, slot.sectionId)))[0].programId, v.settings);
      const shift = minutes(b.startsAt) - minutes(hhmm(slot.startsAt));
      const moved = members.map((m) => {
        const start = timeOf(minutes(hhmm(m.startsAt)) + shift);
        // Snap to the bell: a period that lands on a period's start takes its end; otherwise the same length.
        const bellPeriod = bell.periods.find((x) => x.startsAt === start);
        const end = bellPeriod?.endsAt ?? timeOf(minutes(hhmm(m.endsAt)) + shift);
        return { ...m, dayOfWeek: b.dayOfWeek, startsAt: start, endsAt: end, roomId: m.id === slot.id && b.roomId !== undefined ? b.roomId : m.roomId, teacherId: m.id === slot.id && b.teacherId ? b.teacherId : m.teacherId };
      });
      if (moved.some((m) => m.startsAt >= m.endsAt || m.endsAt > '23:59')) throw new BadRequestException('The period does not fit in the day there');
      const ignore = members.map((m) => m.id);
      const problems = (await Promise.all(moved.map(async (m) => (await this.svc.problems(tx, v, m, ignore)).map((x) => ({ ...x, slotId: m.id }))))).flat();
      if (b.dryRun) return { ok: problems.length === 0, problems };
      if (problems.length) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: problems[0].code, message: problems[0].message, problems });
      for (const m of moved) await tx.update(timetableVersionSlots).set({ dayOfWeek: m.dayOfWeek, startsAt: m.startsAt, endsAt: m.endsAt, roomId: m.roomId, teacherId: m.teacherId }).where(eq(timetableVersionSlots.id, m.id));
      await this.touch(tx, p, v.id, 'timetable.version_slot_moved', { slotId, periods: moved.length, to: { dayOfWeek: b.dayOfWeek, startsAt: b.startsAt }, from: { dayOfWeek: slot.dayOfWeek, startsAt: hhmm(slot.startsAt) } });
      return { ok: true, problems: [], slots: await this.slotRows(tx, v.id, ignore) };
    });
  }

  @Post('versions/:id/slots/:slotId/lock')
  @HttpCode(200)
  @Auth('user', STUDIO_WRITE)
  lock(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('slotId', ParseUUIDPipe) slotId: string, @Body(new ZodBody(LockBody)) b: z.infer<typeof LockBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.draft(tx, id);
      const [slot] = await tx.select().from(timetableVersionSlots).where(and(eq(timetableVersionSlots.id, slotId), eq(timetableVersionSlots.versionId, v.id)));
      if (!slot) throw new NotFoundException('Period not found');
      await tx.update(timetableVersionSlots).set({ locked: b.locked }).where(slot.blockId ? and(eq(timetableVersionSlots.versionId, v.id), eq(timetableVersionSlots.blockId, slot.blockId)) : eq(timetableVersionSlots.id, slot.id));
      await this.touch(tx, p, v.id, b.locked ? 'timetable.version_slot_locked' : 'timetable.version_slot_unlocked', { slotId });
      return { locked: b.locked };
    });
  }

  @Delete('versions/:id/slots/:slotId')
  @HttpCode(204)
  @Auth('user', STUDIO_WRITE)
  async removeSlot(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('slotId', ParseUUIDPipe) slotId: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.draft(tx, id);
      const [slot] = await tx.select().from(timetableVersionSlots).where(and(eq(timetableVersionSlots.id, slotId), eq(timetableVersionSlots.versionId, v.id)));
      if (!slot) throw new NotFoundException('Period not found');
      await tx.delete(timetableVersionSlots).where(slot.blockId ? and(eq(timetableVersionSlots.versionId, v.id), eq(timetableVersionSlots.blockId, slot.blockId)) : eq(timetableVersionSlots.id, slot.id));
      await this.touch(tx, p, v.id, 'timetable.version_slot_removed', { slotId, subjectId: slot.subjectId, sectionId: slot.sectionId });
    });
  }

  /** The problems a period would have at a place, without saving (for the add form and the live editor's hints). */
  @Post('versions/:id/check')
  @HttpCode(200)
  @Auth('user', STUDIO_WRITE)
  check(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SlotBody)) b: z.infer<typeof SlotBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.version(tx, id);
      const problems = await this.svc.problems(tx, v, b as SlotDraft);
      return { ok: problems.length === 0, problems };
    });
  }

  @Post('versions/:id/publish')
  @HttpCode(200)
  @Auth('user', STUDIO_WRITE)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PublishBody)) b: z.infer<typeof PublishBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.publish(tx, p, id, b));
  }

  @Post('versions/:id/discard')
  @HttpCode(200)
  @Auth('user', STUDIO_WRITE)
  discard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.draft(tx, id);
      await tx.update(timetableVersions).set({ status: 'discarded', updatedAt: new Date() }).where(eq(timetableVersions.id, v.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.version_discarded', subjectType: 'timetable_version', subjectId: v.id, changes: { status: { before: 'draft', after: 'discarded' } } });
      return { status: 'discarded' };
    });
  }

  /** A new draft with the same periods: to change a published version, or to go back to an older one. */
  @Post('versions/:id/duplicate')
  @Auth('user', STUDIO_WRITE)
  duplicate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.svc.version(tx, id);
      const [copy] = await tx
        .insert(timetableVersions)
        .values({ tenantId: p.tenantId, academicYearId: v.academicYearId, versionNo: await this.svc.nextNo(tx), name: `${v.name} (copy)`.slice(0, 120), sectionIds: v.sectionIds, source: 'copy', basedOnId: v.id, settings: v.settings, report: {}, notes: v.notes, createdBy: p.userId })
        .returning();
      const slots = await tx.select().from(timetableVersionSlots).where(eq(timetableVersionSlots.versionId, v.id));
      const blockIds = new Map<string, string>();
      if (slots.length)
        await tx.insert(timetableVersionSlots).values(
          slots.map(({ id: _id, createdAt: _c, versionId: _v, blockId, ...s }) => {
            if (blockId && !blockIds.has(blockId)) blockIds.set(blockId, crypto.randomUUID());
            return { ...s, versionId: copy.id, blockId: blockId ? blockIds.get(blockId)! : null };
          }),
        );
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.version_created', subjectType: 'timetable_version', subjectId: copy.id, data: { copyOf: v.versionNo, periods: slots.length } });
      return copy;
    });
  }

  /** Teachers' periods in the version against the weekly and daily limits. */
  @Get('versions/:id/workload')
  @Auth('user', STUDIO_READ)
  workload(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.workload(tx, await this.svc.version(tx, id)));
  }

  /**
   * A printable week grid (landscape A4) of a class, teacher or room: from a version, or from the live timetable when
   * the version id is `live`.
   */
  @Get('versions/:id/pdf')
  @Auth('user', STUDIO_READ)
  async pdf(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string, @Query() raw: Record<string, string>, @Res() res: Response) {
    const q = ViewQuery.safeParse(raw);
    if (!q.success) throw new BadRequestException('Choose a class, teacher or room');
    if (id !== 'live' && !z.uuid().safeParse(id).success) throw new BadRequestException('Unknown version');
    const buf = await this.db.withTenant(p.tenantId, async (tx) => {
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
      const v = id === 'live' ? null : await this.svc.version(tx, id);
      const rows = v ? await this.slotRows(tx, v.id) : await this.liveRows(tx);
      const col = q.data.by === 'teacher' ? 'teacherId' : q.data.by === 'room' ? 'roomId' : 'sectionId';
      const mine = rows.filter((r) => r[col] === q.data.id || (q.data.by === 'class' && (r.combinedSectionIds ?? []).includes(q.data.id)));
      const name =
        q.data.by === 'teacher'
          ? (await tx.select({ n: users.fullName }).from(users).where(eq(users.id, q.data.id)))[0]?.n
          : q.data.by === 'room'
            ? (await tx.select({ n: rooms.name }).from(rooms).where(eq(rooms.id, q.data.id)))[0]?.n
            : (await tx.select({ n: sections.displayName }).from(sections).where(eq(sections.id, q.data.id)))[0]?.n;
      if (!name) throw new NotFoundException('Not found');
      const programId = q.data.by === 'class' ? (await tx.select({ id: sections.programId }).from(sections).where(eq(sections.id, q.data.id)))[0]?.id : mine[0] ? (await tx.select({ id: sections.programId }).from(sections).where(eq(sections.id, mine[0].sectionId)))[0]?.id : undefined;
      const bell = await this.svc.periodsFor(tx, programId ?? '00000000-0000-0000-0000-000000000000', v?.settings ?? {});
      const periods = bell.periods.length ? bell.periods : [...new Map(mine.map((m) => [m.startsAt, { startsAt: m.startsAt, endsAt: m.endsAt }])).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const days = [...new Set([...bell.days, ...mine.map((m) => m.dayOfWeek)])].sort();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.printed', subjectType: v ? 'timetable_version' : 'timetable', subjectId: v?.id, data: { by: q.data.by, id: q.data.id } });
      const who = { class: 'Class', teacher: 'Teacher', room: 'Room' }[q.data.by];
      return timetablePdf({
        institution: tenant?.name ?? '',
        title: `Timetable: ${name}`,
        subtitle: v ? `${who} view · Version ${v.versionNo} (${v.name}) · ${v.status}${v.effectiveFrom ? ` · from ${v.effectiveFrom}` : ''}` : `${who} view · live timetable`,
        days,
        periods,
        cells: mine.map((m) => ({ dayOfWeek: m.dayOfWeek, startsAt: m.startsAt, endsAt: m.endsAt, lines: [`${m.subjectCode ?? ''} ${m.subject}${m.batch ? ` (${m.batch})` : ''}`.trim(), q.data.by === 'class' ? m.teacher : m.section, q.data.by === 'room' ? m.teacher : (m.room ?? '')].filter(Boolean) })),
        footer: `Printed from ZYNETIX ${new Date().toISOString().slice(0, 10)}`,
      });
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="timetable-${q.data.by}.pdf"`);
    res.end(buf);
  }

  /** Classes, subjects, teachers, rooms and departments for the studio's pickers. */
  @Get('options')
  @Auth('user', STUDIO_READ)
  options(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
      const secs = year ? await tx.select({ id: sections.id, displayName: sections.displayName, programId: sections.programId, term: sections.term }).from(sections).where(eq(sections.academicYearId, year.id)) : [];
      const subs = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, programId: subjects.programId, term: subjects.term, courseType: subjects.courseType, lectureHours: subjects.lectureHours, tutorialHours: subjects.tutorialHours, practicalHours: subjects.practicalHours }).from(subjects).orderBy(asc(subjects.code));
      const roomRows = await tx.select({ id: rooms.id, name: rooms.name, kind: rooms.kind, capacity: rooms.capacity }).from(rooms).where(eq(rooms.active, true)).orderBy(asc(rooms.name));
      const deps = await tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name));
      return { sections: secs.sort((a, b) => naturalCompare(a.displayName, b.displayName)), subjects: subs, rooms: roomRows, staff: await this.svc.staff(tx), departments: deps, settings: await this.svc.settings(tx) };
    });
  }

  // ----------------------------------------------------------------------------------------------------------------

  private async touch(tx: Tx, p: UserPrincipal, id: string, action: string, data: Record<string, unknown>) {
    await tx.update(timetableVersions).set({ updatedAt: new Date() }).where(eq(timetableVersions.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action, subjectType: 'timetable_version', subjectId: id, data });
  }

  private async checkRefs(tx: Tx, b: z.infer<typeof SlotBody>) {
    const [section] = await tx.select().from(sections).where(eq(sections.id, b.sectionId));
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, b.subjectId));
    if (!section || !subject) throw new NotFoundException('Class or subject not found');
    if (subject.programId !== section.programId || subject.term !== section.term) throw new BadRequestException('That subject is not taught in this class');
    const staff = await this.svc.staff(tx);
    if (!staff.some((s) => s.id === b.teacherId)) throw new BadRequestException('Choose a member of the teaching staff');
    if (b.combinedSectionIds?.length) {
      const others = await tx.select({ id: sections.id }).from(sections).where(inArray(sections.id, b.combinedSectionIds));
      if (others.length !== new Set(b.combinedSectionIds).size) throw new NotFoundException('Class not found');
    }
  }

  private async slotRows(tx: Tx, versionId: string, only?: string[]) {
    const rows = await tx
      .select({
        id: timetableVersionSlots.id,
        sectionId: timetableVersionSlots.sectionId,
        section: sections.displayName,
        subjectId: timetableVersionSlots.subjectId,
        subject: subjects.name,
        subjectCode: subjects.code,
        teacherId: timetableVersionSlots.teacherId,
        teacher: users.fullName,
        roomId: timetableVersionSlots.roomId,
        room: rooms.name,
        dayOfWeek: timetableVersionSlots.dayOfWeek,
        startsAt: sql<string>`to_char(${timetableVersionSlots.startsAt}, 'HH24:MI')`,
        endsAt: sql<string>`to_char(${timetableVersionSlots.endsAt}, 'HH24:MI')`,
        batch: timetableVersionSlots.batch,
        combinedSectionIds: timetableVersionSlots.combinedSectionIds,
        kind: timetableVersionSlots.kind,
        basketId: timetableVersionSlots.basketId,
        blockId: timetableVersionSlots.blockId,
        locked: timetableVersionSlots.locked,
      })
      .from(timetableVersionSlots)
      .innerJoin(sections, eq(sections.id, timetableVersionSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableVersionSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableVersionSlots.teacherId))
      .leftJoin(rooms, eq(rooms.id, timetableVersionSlots.roomId))
      .where(and(eq(timetableVersionSlots.versionId, versionId), only ? inArray(timetableVersionSlots.id, only) : undefined))
      .orderBy(asc(timetableVersionSlots.dayOfWeek), asc(timetableVersionSlots.startsAt), asc(sections.displayName));
    return rows;
  }

  private async liveRows(tx: Tx) {
    return tx
      .select({
        id: timetableSlots.id,
        sectionId: timetableSlots.sectionId,
        section: sections.displayName,
        subjectId: timetableSlots.subjectId,
        subject: subjects.name,
        subjectCode: subjects.code,
        teacherId: timetableSlots.teacherId,
        teacher: users.fullName,
        roomId: timetableSlots.roomId,
        room: rooms.name,
        dayOfWeek: timetableSlots.dayOfWeek,
        startsAt: sql<string>`to_char(${timetableSlots.startsAt}, 'HH24:MI')`,
        endsAt: sql<string>`to_char(${timetableSlots.endsAt}, 'HH24:MI')`,
        batch: timetableSlots.batch,
        combinedSectionIds: timetableSlots.combinedSectionIds,
      })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
      .where(isNull(timetableSlots.archivedAt))
      .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.startsAt));
  }
}
