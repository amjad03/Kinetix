import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { impactFrameworks, impactRecords } from '../db/schema-pathways.js';

const IMPACT_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'research_coordinator'];
const IMPACT_WRITERS: RoleName[] = [...IMPACT_ADMIN, 'hod', 'teacher', 'placement_officer'];
const Indicator = z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(120), unit: z.string().trim().max(30).default('') });
const FrameworkBody = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(''),
  indicators: z.array(Indicator).min(1).max(30).refine((l) => new Set(l.map((i) => i.code)).size === l.length, 'Indicator codes must be different'),
});
const FrameworkPatch = FrameworkBody.omit({ code: true }).extend({ active: z.boolean().default(true) });
const RecordBody = z.object({
  frameworkId: z.uuid(),
  indicatorCode: z.string().trim().min(1).max(20),
  subjectKind: z.enum(['project', 'event', 'internship', 'club_activity', 'other']),
  subjectRef: z.string().trim().max(120).default(''),
  quantity: z.number().min(0).max(1_000_000_000),
  note: z.string().trim().max(500).default(''),
  recordedOn: Day,
});

/**
 * The institution's own impact framework next to the UN SDGs: define indicators (trees planted, households reached…),
 * record what projects, events and internships contribute, and read the totals.
 */
@Controller('v1/impact')
export class ImpactController {
  constructor(private readonly db: DbService) {}

  @Get('frameworks')
  @Auth('user', IMPACT_WRITERS)
  frameworks(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(impactFrameworks).orderBy(impactFrameworks.name));
  }

  @Post('frameworks')
  @Auth('user', IMPACT_ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FrameworkBody)) b: z.infer<typeof FrameworkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A framework with that code already exists', () => tx.insert(impactFrameworks).values({ tenantId: p.tenantId, ...b, code: b.code.toUpperCase() }).returning());
      await auditUser(tx, p, 'impact.framework_created', 'impact_framework', row.id, { code: row.code });
      return row;
    });
  }

  @Put('frameworks/:id')
  @Auth('user', IMPACT_ADMIN)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FrameworkPatch)) b: z.infer<typeof FrameworkPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(impactFrameworks).set(b).where(eq(impactFrameworks.id, id)).returning();
      if (!row) throw new NotFoundException('Framework not found');
      return row;
    });
  }

  @Post('records')
  @Auth('user', IMPACT_WRITERS)
  record(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RecordBody)) b: z.infer<typeof RecordBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fw] = await tx.select().from(impactFrameworks).where(eq(impactFrameworks.id, b.frameworkId));
      if (!fw || !fw.active) throw new NotFoundException('Framework not found');
      if (!fw.indicators.some((i) => i.code === b.indicatorCode)) throw new ConflictException('That indicator is not part of the framework');
      const [row] = await tx.insert(impactRecords).values({ tenantId: p.tenantId, ...b, recordedBy: p.userId }).returning();
      await auditUser(tx, p, 'impact.recorded', 'impact_framework', fw.id, { indicator: b.indicatorCode, quantity: b.quantity });
      return row;
    });
  }

  @Get('records')
  @Auth('user', IMPACT_WRITERS)
  records(@CurrentPrincipal() p: UserPrincipal, @Query('frameworkId') frameworkId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(impactRecords).where(frameworkId ? eq(impactRecords.frameworkId, frameworkId) : undefined).orderBy(desc(impactRecords.recordedOn)).limit(200),
    );
  }

  /** Totals per indicator, split by what contributed. */
  @Get('frameworks/:id/dashboard')
  @HttpCode(200)
  @Auth('user', IMPACT_WRITERS)
  dashboard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fw] = await tx.select().from(impactFrameworks).where(eq(impactFrameworks.id, id));
      if (!fw) throw new NotFoundException('Framework not found');
      const rows = await tx
        .select({ code: impactRecords.indicatorCode, kind: impactRecords.subjectKind, total: sql<number>`sum(${impactRecords.quantity})::float`, n: sql<number>`count(*)::int` })
        .from(impactRecords)
        .where(and(eq(impactRecords.frameworkId, id)))
        .groupBy(impactRecords.indicatorCode, impactRecords.subjectKind);
      return {
        framework: { id: fw.id, code: fw.code, name: fw.name },
        indicators: fw.indicators.map((i) => {
          const mine = rows.filter((r) => r.code === i.code);
          return { ...i, total: mine.reduce((s, r) => s + r.total, 0), records: mine.reduce((s, r) => s + r.n, 0), bySource: Object.fromEntries(mine.map((r) => [r.kind, r.total])) };
        }),
      };
    });
  }
}
