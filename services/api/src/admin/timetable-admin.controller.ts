import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, rooms, sections, subjects, timetableSlots, userRoles, users } from '../db/schema.js';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30');
const SlotBody = z
  .object({
    sectionId: z.uuid(),
    subjectId: z.uuid(),
    teacherId: z.uuid(),
    roomId: z.uuid().nullable().optional(),
    dayOfWeek: z.number().int().min(1).max(7),
    startsAt: Time,
    endsAt: Time,
  })
  .refine((s) => s.startsAt < s.endsAt, { message: 'The period must end after it starts', path: ['endsAt'] });

/** Editing the timetable: the principal or admin office adds, moves and removes periods. */
@Controller('v1/admin')
export class TimetableAdminController {
  constructor(private readonly db: DbService) {}

  /** Teaching staff, for the teacher picker. */
  @Get('staff')
  @Auth('user', STAFF_ADMIN_ROLES)
  staff(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .selectDistinct({ id: users.id, fullName: users.fullName, role: userRoles.role })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(inArray(userRoles.role, ['teacher', 'hod', 'principal']), eq(users.status, 'active')))
        .orderBy(asc(users.fullName));
      const byId = new Map<string, { id: string; fullName: string; roles: string[] }>();
      for (const r of rows) {
        const e = byId.get(r.id) ?? { id: r.id, fullName: r.fullName, roles: [] };
        e.roles.push(r.role);
        byId.set(r.id, e);
      }
      return [...byId.values()];
    });
  }

  /** The week's periods for a class or a teacher. */
  @Get('timetable')
  @Auth('user', STAFF_ADMIN_ROLES)
  week(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string, @Query('teacherId') teacherId?: string) {
    for (const v of [sectionId, teacherId]) if (v && !z.uuid().safeParse(v).success) throw new BadRequestException('Bad id');
    if (!sectionId && !teacherId) throw new BadRequestException('Give sectionId or teacherId');
    return this.db.withTenant(p.tenantId, (tx) =>
      this.slots(tx)
        .where(and(isNull(timetableSlots.archivedAt), sectionId ? eq(timetableSlots.sectionId, sectionId) : undefined, teacherId ? eq(timetableSlots.teacherId, teacherId) : undefined))
        .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.startsAt)),
    );
  }

  @Post('timetable/slots')
  @Auth('user', STAFF_ADMIN_ROLES)
  add(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SlotBody)) body: z.infer<typeof SlotBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const values = await this.validate(tx, body, null);
      const [slot] = await tx.insert(timetableSlots).values({ tenantId: p.tenantId, ...values }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.slot_added', subjectType: 'timetable_slot', subjectId: slot.id });
      return this.one(tx, slot.id);
    });
  }

  /**
   * Changing a period archives the old one and creates a new one, so past attendance and
   * recordings keep pointing at what was actually taught.
   */
  @Patch('timetable/slots/:id')
  @Auth('user', STAFF_ADMIN_ROLES)
  change(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SlotBody)) body: z.infer<typeof SlotBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const old = await this.active(tx, id);
      const values = await this.validate(tx, body, old.id);
      await tx.update(timetableSlots).set({ archivedAt: new Date() }).where(eq(timetableSlots.id, old.id));
      const [slot] = await tx.insert(timetableSlots).values({ tenantId: p.tenantId, ...values }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.slot_changed', subjectType: 'timetable_slot', subjectId: slot.id, data: { replaces: old.id } });
      return this.one(tx, slot.id);
    });
  }

  @Delete('timetable/slots/:id')
  @HttpCode(204)
  @Auth('user', STAFF_ADMIN_ROLES)
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      await this.active(tx, id);
      await tx.update(timetableSlots).set({ archivedAt: new Date() }).where(eq(timetableSlots.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.slot_removed', subjectType: 'timetable_slot', subjectId: id });
    });
  }

  // --------------------------------------------------------------------------------------------

  private slots(tx: Tx) {
    return tx
      .select({
        id: timetableSlots.id,
        dayOfWeek: timetableSlots.dayOfWeek,
        startsAt: timetableSlots.startsAt,
        endsAt: timetableSlots.endsAt,
        section: { id: sections.id, displayName: sections.displayName },
        subject: { id: subjects.id, code: subjects.code, name: subjects.name },
        teacher: { id: users.id, fullName: users.fullName },
        roomId: timetableSlots.roomId,
        room: rooms.name,
      })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
      .$dynamic();
  }

  private async one(tx: Tx, id: string) {
    const [s] = await this.slots(tx).where(eq(timetableSlots.id, id));
    return s;
  }

  private async active(tx: Tx, id: string) {
    const [s] = await tx.select().from(timetableSlots).where(and(eq(timetableSlots.id, id), isNull(timetableSlots.archivedAt)));
    if (!s) throw new NotFoundException('Period not found');
    return s;
  }

  /** Checks every id under row-level security, then clashes: class, teacher or room double-booked. */
  private async validate(tx: Tx, b: z.infer<typeof SlotBody>, replacing: string | null) {
    const [section] = await tx.select().from(sections).where(eq(sections.id, b.sectionId));
    if (!section) throw new NotFoundException('Class not found');
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, b.subjectId));
    if (!subject || subject.programId !== section.programId || subject.term !== section.term) throw new BadRequestException('That subject is not taught in this class');
    const [teacher] = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(users.id, b.teacherId), inArray(userRoles.role, ['teacher', 'hod', 'principal'])));
    if (!teacher) throw new BadRequestException('Choose a member of the teaching staff');
    if (b.roomId) {
      const [room] = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, b.roomId));
      if (!room) throw new NotFoundException('Room not found');
    }
    const clash = await tx
      .select({ section: sections.displayName, teacherId: timetableSlots.teacherId, roomId: timetableSlots.roomId, sectionId: timetableSlots.sectionId, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .where(
        and(
          isNull(timetableSlots.archivedAt),
          eq(timetableSlots.dayOfWeek, b.dayOfWeek),
          lt(timetableSlots.startsAt, b.endsAt),
          gt(timetableSlots.endsAt, b.startsAt),
          replacing ? ne(timetableSlots.id, replacing) : undefined,
          or(eq(timetableSlots.sectionId, b.sectionId), eq(timetableSlots.teacherId, b.teacherId), b.roomId ? eq(timetableSlots.roomId, b.roomId) : undefined),
        ),
      )
      .limit(1);
    if (clash.length) {
      const c = clash[0];
      const when = `${c.startsAt.slice(0, 5)}–${c.endsAt.slice(0, 5)}`;
      const what = c.sectionId === b.sectionId ? `${c.section} already has a period` : c.teacherId === b.teacherId ? 'This teacher is already teaching' : 'This room is already booked';
      throw new ConflictException(`${what} at ${when} that day`);
    }
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
    if (!year) throw new BadRequestException('Set the current academic year first');
    return { academicYearId: year.id, sectionId: section.id, subjectId: subject.id, teacherId: teacher.id, roomId: b.roomId ?? null, dayOfWeek: b.dayOfWeek, startsAt: b.startsAt, endsAt: b.endsAt };
  }
}
