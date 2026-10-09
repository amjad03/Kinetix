import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { sections, students } from '../db/schema.js';
import { houseMembers, housePoints, houses } from '../db/schema-curriculum.js';
import { found } from '../placements/placements.access.js';

const ADMINS: RoleName[] = ['tenant_admin', 'principal'];
const AWARDERS: RoleName[] = [...ADMINS, 'hod', 'teacher'];
const VIEW: RoleName[] = [...AWARDERS, 'student', 'guardian'];

const HouseBody = z.object({ name: z.string().trim().min(2).max(60), colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1d4ed8').default('#1d4ed8'), motto: z.string().trim().max(160).default('') });
const MembersBody = z.object({ studentIds: z.array(z.uuid()).min(1).max(500), captainId: z.uuid().optional() });
const PointsBody = z.object({
  points: z.number().int().min(-100).max(100).refine((n) => n !== 0, 'Points cannot be zero'),
  reason: z.string().trim().min(3).max(200),
  category: z.enum(['academics', 'sports', 'arts', 'discipline', 'service', 'general']).default('general'),
  studentId: z.uuid().optional(),
  awardedOn: Day.optional(),
});

/** The house system: houses, member allotment, a points ledger and the leaderboard. */
@Controller('v1/houses')
export class HousesController {
  constructor(private readonly db: DbService) {}

  /** Houses ranked by points, with their member counts. Open to students and parents too. */
  @Get('leaderboard')
  @Auth('user', VIEW)
  leaderboard(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: houses.id,
          name: houses.name,
          colour: houses.colour,
          motto: houses.motto,
          members: sql<number>`(select count(*)::int from house_members m where m.house_id = houses.id)`,
          points: sql<number>`coalesce((select sum(points)::int from house_points hp where hp.house_id = houses.id), 0)`,
        })
        .from(houses)
        .orderBy(asc(houses.name));
      rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
      let rank = 0;
      let last: number | undefined;
      return rows.map((r, i) => {
        if (r.points !== last) rank = i + 1;
        last = r.points;
        return { ...r, rank };
      });
    });
  }

  @Post()
  @Auth('user', ADMINS)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(HouseBody)) b: z.infer<typeof HouseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: houses.id }).from(houses).where(eq(houses.name, b.name));
      if (dup) throw new ConflictException('A house with this name already exists');
      const [row] = await tx.insert(houses).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'houses.created', 'house', row.id, { name: b.name });
      return row;
    });
  }

  /** Allots students to a house (moving them out of any other) and optionally names a captain. */
  @Post(':id/members')
  @HttpCode(200)
  @Auth('user', ADMINS)
  allot(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MembersBody)) b: z.infer<typeof MembersBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, id)))[0], 'House');
      const ids = [...new Set(b.studentIds)];
      const known = await tx.select({ id: students.id }).from(students).where(inArray(students.id, ids));
      if (known.length !== ids.length) throw new BadRequestException('Some students were not found');
      if (b.captainId && !ids.includes(b.captainId)) throw new BadRequestException('The captain must be one of the students being allotted');
      await tx.insert(houseMembers).values(ids.map((studentId) => ({ tenantId: p.tenantId, houseId: id, studentId, isCaptain: studentId === b.captainId }))).onConflictDoUpdate({ target: [houseMembers.tenantId, houseMembers.studentId], set: { houseId: id, isCaptain: sql`excluded.is_captain` } });
      await auditUser(tx, p, 'houses.members_allotted', 'house', id, { count: ids.length });
      return { allotted: ids.length };
    });
  }

  @Get(':id')
  @Auth('user', VIEW)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const house = found((await tx.select().from(houses).where(eq(houses.id, id)))[0], 'House');
      const members = await tx
        .select({ studentId: students.id, name: students.fullName, className: sections.displayName, isCaptain: houseMembers.isCaptain, points: sql<number>`coalesce((select sum(points)::int from house_points hp where hp.house_id = ${houseMembers.houseId} and hp.student_id = ${students.id}), 0)` })
        .from(houseMembers)
        .innerJoin(students, eq(students.id, houseMembers.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(eq(houseMembers.houseId, id))
        .orderBy(desc(houseMembers.isCaptain), asc(students.fullName));
      const ledger = await tx.select().from(housePoints).where(eq(housePoints.houseId, id)).orderBy(desc(housePoints.awardedOn), desc(housePoints.id)).limit(100);
      return { house, members, ledger, total: ledger.length ? (await tx.select({ n: sql<number>`coalesce(sum(points)::int, 0)` }).from(housePoints).where(eq(housePoints.houseId, id)))[0].n : 0 };
    });
  }

  /** Awards (or deducts) points. A student, when named, must belong to the house. */
  @Post(':id/points')
  @Auth('user', AWARDERS)
  award(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PointsBody)) b: z.infer<typeof PointsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, id)))[0], 'House');
      if (b.studentId) {
        const [m] = await tx.select({ id: houseMembers.id }).from(houseMembers).where(and(eq(houseMembers.houseId, id), eq(houseMembers.studentId, b.studentId)));
        if (!m) throw new BadRequestException('This student is not in the house');
      }
      const [row] = await tx
        .insert(housePoints)
        .values({ tenantId: p.tenantId, houseId: id, studentId: b.studentId ?? null, points: b.points, category: b.category, reason: b.reason, awardedOn: b.awardedOn ?? new Date().toISOString().slice(0, 10), awardedBy: p.userId })
        .returning();
      await auditUser(tx, p, 'houses.points_awarded', 'house', id, { points: b.points, category: b.category });
      return row;
    });
  }
}
