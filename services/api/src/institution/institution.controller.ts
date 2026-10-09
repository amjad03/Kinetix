import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { buildingFloors, buildings, campuses, institutionProfiles, rooms } from '../db/schema.js';

/** ERP sections an institution may switch off (they disappear from the navigation). */
export const TOGGLE_MODULES = ['hostel', 'transport', 'canteen', 'library', 'placements', 'research', 'obe', 'courseRegistration', 'earlyYears', 'alumni', 'inventory', 'assets', 'skills', 'campusLife', 'mentoring', 'workflows'] as const;
export const ACADEMIC_MODELS = ['school', 'puc', 'ug', 'pg', 'university'] as const;

const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const ProfileBody = z.object({
  legalName: opt(200),
  affiliationBody: opt(200),
  affiliationNo: opt(80),
  aisheCode: z.string().trim().regex(/^[A-Z]-?\d{1,6}$/i, 'AISHE code looks like C-12345').nullable().optional(),
  naacGrade: z.enum(['A++', 'A+', 'A', 'B++', 'B+', 'B', 'C', 'D']).nullable().optional(),
  establishedYear: z.number().int().min(1800).max(2100).nullable().optional(),
  addressLine: opt(300),
  city: opt(100),
  state: opt(100),
  pincode: z.string().trim().regex(/^\d{6}$/, 'The PIN code has 6 digits').nullable().optional(),
  phone: opt(30),
  email: z.email().nullable().optional(),
  website: z.url().max(300).nullable().optional(),
  academicModel: z.enum(ACADEMIC_MODELS).optional(),
  boardOrUniversity: opt(160),
  disabledModules: z.array(z.enum(TOGGLE_MODULES)).max(TOGGLE_MODULES.length).optional(),
});
const BuildingBody = z.object({ campusId: z.uuid(), name: z.string().trim().min(1).max(120), code: z.string().trim().max(20).optional() });
const FloorBody = z.object({ level: z.number().int().min(-5).max(100), label: z.string().trim().min(1).max(60) });
const RoomFloorBody = z.object({ floorId: z.uuid().nullable() });

async function readProfile(tx: Tx) {
  const [row] = await tx.select().from(institutionProfiles);
  return row ?? null;
}

/** Institution profile, capability profile (academic model and module toggles) and buildings. */
@Controller('v1')
export class InstitutionController {
  constructor(private readonly db: DbService) {}

  /** What the ERP needs to shape itself; any signed-in user. */
  @Get('institution/capabilities')
  @Auth('user')
  capabilities(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await readProfile(tx);
      return { academicModel: r?.academicModel ?? 'school', boardOrUniversity: r?.boardOrUniversity ?? null, disabledModules: r?.disabledModules ?? [], toggleableModules: [...TOGGLE_MODULES] };
    });
  }

  @Get('admin/institution/profile')
  @Auth('user', STAFF_ADMIN_ROLES)
  profile(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ ...(await readProfile(tx)), toggleableModules: [...TOGGLE_MODULES] }));
  }

  @Put('admin/institution/profile')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveProfile(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ProfileBody)) b: z.infer<typeof ProfileBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await readProfile(tx);
      const values = { ...b, disabledModules: b.disabledModules ? [...new Set(b.disabledModules)] : undefined, updatedAt: new Date() };
      const [row] = await tx.insert(institutionProfiles).values({ tenantId: p.tenantId, ...values }).onConflictDoUpdate({ target: institutionProfiles.tenantId, set: values }).returning();
      const changed = Object.keys(b).filter((k) => JSON.stringify((before as Record<string, unknown> | null)?.[k] ?? null) !== JSON.stringify((row as Record<string, unknown>)[k] ?? null));
      if (changed.length) await auditUser(tx, p, 'institution.profile.updated', 'tenant', p.tenantId, { changed });
      return { ...row, toggleableModules: [...TOGGLE_MODULES] };
    });
  }

  /** Campuses with their buildings, floors and rooms, plus rooms not yet placed. */
  @Get('admin/institution/buildings')
  @Auth('user', STAFF_ADMIN_ROLES)
  tree(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const camps = await tx.select().from(campuses).orderBy(asc(campuses.name));
      const blds = await tx.select().from(buildings).orderBy(asc(buildings.name));
      const floors = await tx.select().from(buildingFloors).orderBy(asc(buildingFloors.level));
      const rms = await tx.select().from(rooms).orderBy(asc(rooms.name));
      const room = (r: (typeof rms)[number]) => ({ id: r.id, name: r.name, kind: r.kind, capacity: r.capacity });
      return {
        campuses: camps.map((c) => ({ id: c.id, name: c.name })),
        buildings: blds.map((b) => ({
          ...b,
          floors: floors.filter((f) => f.buildingId === b.id).map((f) => ({ id: f.id, level: f.level, label: f.label, rooms: rms.filter((r) => r.floorId === f.id).map(room) })),
        })),
        unplacedRooms: rms.filter((r) => !r.floorId).map((r) => ({ ...room(r), campusId: r.campusId })),
      };
    });
  }

  @Post('admin/institution/buildings')
  @Auth('user', STAFF_ADMIN_ROLES)
  addBuilding(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BuildingBody)) b: z.infer<typeof BuildingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [camp] = await tx.select({ id: campuses.id }).from(campuses).where(eq(campuses.id, b.campusId));
      if (!camp) throw new NotFoundException('Campus not found');
      const [row] = await tx.insert(buildings).values({ tenantId: p.tenantId, campusId: b.campusId, name: b.name, code: b.code ?? null }).returning();
      await auditUser(tx, p, 'institution.building.added', 'building', row.id, { name: b.name });
      return row;
    });
  }

  @Post('admin/institution/buildings/:id/floors')
  @Auth('user', STAFF_ADMIN_ROLES)
  addFloor(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FloorBody)) b: z.infer<typeof FloorBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [bld] = await tx.select({ id: buildings.id }).from(buildings).where(eq(buildings.id, id));
      if (!bld) throw new NotFoundException('Building not found');
      const existing = await tx.select({ level: buildingFloors.level }).from(buildingFloors).where(eq(buildingFloors.buildingId, id));
      if (existing.some((f) => f.level === b.level)) throw new ConflictException('That floor already exists');
      const [row] = await tx.insert(buildingFloors).values({ tenantId: p.tenantId, buildingId: id, level: b.level, label: b.label }).returning();
      await auditUser(tx, p, 'institution.floor.added', 'building', id, { level: b.level, label: b.label });
      return row;
    });
  }

  /** Places an existing room on a floor (or takes it off, with null). */
  @Put('admin/institution/rooms/:roomId/floor')
  @Auth('user', STAFF_ADMIN_ROLES)
  placeRoom(@CurrentPrincipal() p: UserPrincipal, @Param('roomId', ParseUUIDPipe) roomId: string, @Body(new ZodBody(RoomFloorBody)) b: z.infer<typeof RoomFloorBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.floorId) {
        const [f] = await tx.select({ id: buildingFloors.id }).from(buildingFloors).where(eq(buildingFloors.id, b.floorId));
        if (!f) throw new NotFoundException('Floor not found');
      }
      const [row] = await tx.update(rooms).set({ floorId: b.floorId }).where(eq(rooms.id, roomId)).returning({ id: rooms.id, name: rooms.name, floorId: rooms.floorId });
      if (!row) throw new NotFoundException('Room not found');
      await auditUser(tx, p, 'institution.room.placed', 'room', roomId, { floorId: b.floorId });
      return row;
    });
  }
}
