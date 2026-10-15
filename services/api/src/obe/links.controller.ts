import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { obeUnitCos, peoPoMap } from '../db/schema-obe-depth.js';
import { chapters, coSets, courseOutcomes, programOutcomes, subjects, topics } from '../db/schema.js';
import { peoAttainment } from './attainment.js';
import { ObeService } from './obe.service.js';
import { assertCoEditor } from './workflow.js';

const OBE_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'quality_officer'];

const PeoPoBody = z.object({ cells: z.array(z.object({ peoId: z.uuid(), outcomeId: z.uuid(), strength: z.number().int().min(0).max(3), justification: z.string().trim().max(500).optional() })).max(2000) });
const UnitsBody = z.object({ cells: z.array(z.object({ chapterId: z.uuid(), coCode: z.string().trim().min(1).max(30) })).max(2000) });

/**
 * Links that complete the OBE hierarchy (migration 0185): the PEO-PO/PSO matrix with each PEO's attainment worked out
 * from its POs, and the course plan that ties each unit of a course's syllabus to the COs it serves.
 */
@Controller('v1/obe')
export class ObeLinksController {
  constructor(
    private readonly db: DbService,
    private readonly obe: ObeService,
  ) {}

  // --- PEO-PO/PSO matrix and PEO attainment ------------------------------------------------------

  /** The matrix and, for a year, each PEO's attainment: the strength-weighted average of its POs' overall attainment. */
  @Get('programs/:programId/peo-po')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  peoPo(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId') academicYearId?: string) {
    if (academicYearId && !z.uuid().safeParse(academicYearId).success) throw new BadRequestException('Choose an academic year');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const rows = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, programId), inArray(programOutcomes.kind, ['peo', 'po', 'pso']))).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord), asc(programOutcomes.code));
      const cells = await tx.select().from(peoPoMap).where(eq(peoPoMap.programId, programId));
      const peos = rows.filter((r) => r.kind === 'peo');
      const outcomes = rows.filter((r) => r.kind !== 'peo').sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'po' ? -1 : 1));
      const config = (await this.obe.policy(tx, programId, null, academicYearId ?? null)).config;
      const levels = new Map<string, number | null>();
      if (academicYearId) for (const r of (await this.obe.latest(tx, programId, academicYearId)).rows) if (r.scope === 'po') levels.set(r.targetId, r.combined);
      return {
        peos: peos.map((r) => ({ id: r.id, code: r.code, statement: r.statement })),
        outcomes: outcomes.map((r) => ({ id: r.id, code: r.code, kind: r.kind, statement: r.statement, attainment: levels.get(r.id) ?? null })),
        cells: cells.map((c) => ({ peoId: c.peoId, outcomeId: c.outcomeId, strength: c.strength, justification: c.justification ?? '' })),
        maxLevel: config.maxLevel,
        targetLevel: config.targetLevel,
        attainment: peos.map((r) => ({ peoId: r.id, code: r.code, ...peoAttainment(cells.filter((c) => c.peoId === r.id), levels, config.decimals), met: null as boolean | null })).map((a) => ({ ...a, met: a.value === null ? null : a.value >= config.targetLevel })),
      };
    });
  }

  /** Replaces the matrix; once anything is mapped every PEO must be served by at least one PO or PSO. */
  @Put('programs/:programId/peo-po')
  @Auth('user', OBE_ADMIN)
  savePeoPo(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(PeoPoBody)) body: z.infer<typeof PeoPoBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const rows = await tx.select({ id: programOutcomes.id, kind: programOutcomes.kind, code: programOutcomes.code }).from(programOutcomes).where(eq(programOutcomes.programId, programId));
      const peos = new Set(rows.filter((r) => r.kind === 'peo').map((r) => r.id));
      const pos = new Set(rows.filter((r) => r.kind === 'po' || r.kind === 'pso').map((r) => r.id));
      if (body.cells.some((c) => !peos.has(c.peoId) || !pos.has(c.outcomeId))) throw new BadRequestException('The matrix has a PEO or PO of another programme');
      const keep = body.cells.filter((c) => c.strength > 0);
      if (new Set(keep.map((c) => `${c.peoId}:${c.outcomeId}`)).size !== keep.length) throw new BadRequestException('A PEO and PO pair appears twice');
      const orphan = rows.filter((r) => r.kind === 'peo' && !keep.some((c) => c.peoId === r.id)).map((r) => r.code);
      if (orphan.length && keep.length) throw new BadRequestException(`Map ${orphan.join(', ')} to at least one PO or PSO`);
      await tx.delete(peoPoMap).where(eq(peoPoMap.programId, programId));
      if (keep.length) await tx.insert(peoPoMap).values(keep.map((c) => ({ tenantId: p.tenantId, programId, peoId: c.peoId, outcomeId: c.outcomeId, strength: c.strength, justification: c.justification?.trim() || null })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.peo_po.saved', subjectType: 'program', subjectId: programId, data: { cells: keep.length } });
      return { cells: keep.length };
    });
  }

  // --- Course plan: units and COs --------------------------------------------------------------

  /** The course's units (from its syllabus) with their topics and the COs each serves, and the COs no unit serves. */
  @Get('subjects/:subjectId/units')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  units(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCoEditor(tx, p, subjectId);
      return this.plan(tx, subjectId);
    });
  }

  /** Replaces the course plan. Units must be the course's own; CO codes must be in its current CO version. */
  @Put('subjects/:subjectId/units')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  saveUnits(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Body(new ZodBody(UnitsBody)) body: z.infer<typeof UnitsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCoEditor(tx, p, subjectId);
      const plan = await this.plan(tx, subjectId);
      if (!plan.units.length) throw new BadRequestException('Link the course to a syllabus in the content library first');
      if (!plan.cos.length) throw new BadRequestException('Write the course outcomes first');
      const unitIds = new Set(plan.units.map((u) => u.id));
      const codes = new Map(plan.cos.map((c) => [c.code.toUpperCase(), c.code]));
      const cells = body.cells.map((c) => ({ chapterId: c.chapterId, coCode: codes.get(c.coCode.toUpperCase()) ?? null }));
      if (body.cells.some((c) => !unitIds.has(c.chapterId))) throw new BadRequestException('A unit is not from this course’s syllabus');
      const bad = body.cells.filter((_, i) => !cells[i].coCode).map((c) => c.coCode);
      if (bad.length) throw new BadRequestException(`${bad.join(', ')}: not a CO of this course`);
      const unique = [...new Map(cells.map((c) => [`${c.chapterId}:${c.coCode}`, c as { chapterId: string; coCode: string }])).values()];
      await tx.delete(obeUnitCos).where(eq(obeUnitCos.subjectId, subjectId));
      if (unique.length) await tx.insert(obeUnitCos).values(unique.map((c) => ({ tenantId: p.tenantId, subjectId, chapterId: c.chapterId, coCode: c.coCode, setBy: p.userId })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.course_plan.saved', subjectType: 'subject', subjectId, data: { links: unique.length } });
      return this.plan(tx, subjectId);
    });
  }

  private async plan(tx: Tx, subjectId: string) {
    const [sub] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
    if (!sub) throw new NotFoundException('Subject not found');
    return unitPlan(tx, sub);
  }
}

/** A course's units with topics and CO codes, its current COs, and the COs that no unit serves (shared with the course file). */
export async function unitPlan(tx: Tx, sub: typeof subjects.$inferSelect) {
  const chs = sub.courseId ? await tx.select().from(chapters).where(eq(chapters.courseId, sub.courseId)).orderBy(asc(chapters.position)) : [];
  const tps = chs.length ? await tx.select({ chapterId: topics.chapterId, title: topics.title }).from(topics).where(inArray(topics.chapterId, chs.map((c) => c.id))).orderBy(asc(topics.position)) : [];
  const [set] = await tx.select().from(coSets).where(eq(coSets.subjectId, sub.id)).orderBy(desc(eq(coSets.status, 'active')), desc(coSets.version)).limit(1);
  const cos = set ? await tx.select({ code: courseOutcomes.code, statement: courseOutcomes.statement, bloomLevel: courseOutcomes.bloomLevel }).from(courseOutcomes).where(eq(courseOutcomes.coSetId, set.id)).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
  const links = await tx.select({ chapterId: obeUnitCos.chapterId, coCode: obeUnitCos.coCode }).from(obeUnitCos).where(eq(obeUnitCos.subjectId, sub.id));
  const live = new Set(cos.map((c) => c.code));
  const units = chs.map((c) => ({ id: c.id, position: c.position, title: c.title, topics: tps.filter((t) => t.chapterId === c.id).map((t) => t.title), coCodes: links.filter((l) => l.chapterId === c.id && live.has(l.coCode)).map((l) => l.coCode).sort() }));
  const served = new Set(units.flatMap((u) => u.coCodes));
  return { coVersion: set?.version ?? null, units, cos, uncovered: cos.map((c) => c.code).filter((c) => !served.has(c)) };
}

