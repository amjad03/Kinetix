import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { rooms, sections, subjects, timetableSlots, userRoles, users } from '../db/schema.js';
import { Time, validateSlot } from './timetable-rules.js';

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

const RoomPatch = z.object({ capacity: z.number().int().min(1).max(5000).nullable().optional(), kind: z.enum(['classroom', 'lab', 'hall']).optional() });

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

  /** Rooms and labs with their seats, for the capacity check. */
  @Get('rooms')
  @Auth('user', STAFF_ADMIN_ROLES)
  rooms(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: rooms.id, name: rooms.name, campusId: rooms.campusId, capacity: rooms.capacity, kind: rooms.kind }).from(rooms).orderBy(asc(rooms.name)));
  }

  @Patch('rooms/:id')
  @Auth('user', STAFF_ADMIN_ROLES)
  setRoom(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RoomPatch)) body: z.infer<typeof RoomPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [room] = await tx.update(rooms).set(body).where(eq(rooms.id, id)).returning();
      if (!room) throw new NotFoundException('Room not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.room_changed', subjectType: 'room', subjectId: id, data: body });
      return { id: room.id, name: room.name, capacity: room.capacity, kind: room.kind };
    });
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

  private validate(tx: Tx, b: z.infer<typeof SlotBody>, replacing: string | null) {
    return validateSlot(tx, b, replacing);
  }
}
