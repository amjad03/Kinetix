import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessmentSchemes, gradeScales, schemeComponents, subjects } from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';
import { GRADE_SCALE_PRESETS, SCHEME_PRESETS, validateBands, validateWeights, type GradeScaleRules } from './grading.js';
import { passOf, presetComponents, scaleOf } from '../affiliation/maths.js';
import { resolveAffiliation } from '../affiliation/resolve.js';

/** The key under which the institution's affiliation profile appears among the presets. */
export const AFFILIATION_PRESET = 'affiliation';

/** Presets from the institution's affiliation profile (its grade scale, theory and practical layouts), or none. */
async function affiliationPresets(tx: Tx) {
  const a = await resolveAffiliation(tx, null);
  if (!a) return null;
  const name = `${a.profile.shortName} ${a.scheme.name}`;
  const scale = { name, ...scaleOf(a.rules) };
  const credits = a.rules.credits.perTermTypical ? 4 : 1;
  const schemes: Record<string, { name: string; components: ReturnType<typeof presetComponents>; pass: ReturnType<typeof passOf>; credits: number }> = {
    [AFFILIATION_PRESET]: { name: `${name}: theory`, components: presetComponents(a.rules), pass: passOf(a.rules), credits },
  };
  if (a.rules.assessment.practicalComponents) schemes[`${AFFILIATION_PRESET}-practical`] = { name: `${name}: practical`, components: presetComponents(a.rules, 'practical'), pass: passOf(a.rules), credits: credits === 4 ? 2 : 1 };
  return { profile: { code: a.profile.code, scheme: a.scheme.code, name, ruleAuthority: a.scheme.ruleAuthority }, scale, schemes };
}

export const ADMIN: RoleName[] = ['tenant_admin', 'principal', 'exam_controller'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'exam_controller'];

const Band = z.object({ grade: z.string().trim().min(1).max(4), minPercent: z.number().min(0).max(100), gradePoint: z.number().min(0).max(10), pass: z.boolean() });
const ScaleBody = z.object({
  name: z.string().trim().min(1).max(120),
  preset: z.string().optional(),
  rules: z.object({ bands: z.array(Band).min(1).max(20), pointsMode: z.enum(['band', 'percentOver10']), decimals: z.number().int().min(0).max(4) }).optional(),
  isDefault: z.boolean().default(false),
});

const SchemeBody = z.object({
  subjectId: z.uuid(),
  academicYearId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  credits: z.number().positive().max(30),
  gradeScaleId: z.uuid(),
  /** How many times a student may sit it (default 1); more needs an approved reattempt request. */
  maxAttempts: z.number().int().min(1).max(5).optional(),
  passRules: z.object({ minInternalPercent: z.number().min(0).max(100).nullable(), minExternalPercent: z.number().min(0).max(100).nullable(), minTotalPercent: z.number().min(0).max(100) }),
  components: z
    .array(z.object({ code: z.string().trim().min(1).max(12), name: z.string().trim().min(1).max(80), kind: z.enum(['internal', 'external', 'practical', 'project', 'viva', 'observation', 'diagnostic', 'skill']), weight: z.number().positive().max(100), bestOf: z.number().int().min(1).max(20).nullable().optional() }))
    .min(1)
    .max(12),
});

/** Grade scales and per-subject assessment schemes (IA components, weights, credits, pass rules). */
@Controller('v1')
export class SchemesController {
  constructor(private readonly db: DbService) {}

  /**
   * Ready-made grade scales and component layouts (Bangalore University NEP, UGC, CBSE) to copy from; the
   * institution's affiliation profile comes first under the key "affiliation" when one is selected.
   */
  @Get('scheme-presets')
  @Auth('user', STAFF)
  presets(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await affiliationPresets(tx);
      if (!a) return { gradeScales: GRADE_SCALE_PRESETS, schemes: SCHEME_PRESETS, affiliation: null };
      return { gradeScales: { [AFFILIATION_PRESET]: a.scale, ...GRADE_SCALE_PRESETS }, schemes: { ...a.schemes, ...SCHEME_PRESETS }, affiliation: a.profile };
    });
  }

  @Get('grade-scales')
  @Auth('user', STAFF)
  scales(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(gradeScales).orderBy(asc(gradeScales.name)));
  }

  @Post('grade-scales')
  @Auth('user', ADMIN)
  createScale(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ScaleBody)) body: z.infer<typeof ScaleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fromProfile = body.preset === AFFILIATION_PRESET ? (await affiliationPresets(tx))?.scale : undefined;
      if (body.preset === AFFILIATION_PRESET && !fromProfile) throw new BadRequestException('Choose the university or board the institution is affiliated to first');
      const rules: GradeScaleRules | undefined = body.rules ?? fromProfile ?? (body.preset ? GRADE_SCALE_PRESETS[body.preset] : undefined);
      if (!rules) throw new BadRequestException('Give the grade bands or a preset');
      const err = validateBands(rules.bands);
      if (err) throw new BadRequestException(err);
      if (body.isDefault) await tx.update(gradeScales).set({ isDefault: false });
      const [row] = await tx.insert(gradeScales).values({ tenantId: p.tenantId, name: body.name, rules: { bands: rules.bands, pointsMode: rules.pointsMode, decimals: rules.decimals }, isDefault: body.isDefault }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'gradescale.created', subjectType: 'grade_scale', subjectId: row.id, data: { name: body.name } });
      return row;
    });
  }

  @Get('schemes')
  @Auth('user', STAFF)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('subjectId', ParseUUIDPipe) subjectId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.load(tx, subjectId, academicYearId)) ?? null);
  }

  /** Creates or replaces a subject's scheme for the year. Components are matched by code. */
  @Put('schemes')
  @Auth('user', STAFF)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SchemeBody)) body: z.infer<typeof SchemeBody>) {
    const err = validateWeights(body.components);
    if (err) throw new BadRequestException(err);
    if (new Set(body.components.map((c) => c.code)).size !== body.components.length) throw new BadRequestException('Component codes must be different');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [subject] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, body.subjectId));
      if (!subject) throw new NotFoundException('Subject not found');
      if (!isSchoolAdmin(p) && !(await headsSubject(tx, p, body.subjectId))) throw new ForbiddenException('Only the head of department or the principal can set the scheme');
      const [scale] = await tx.select({ id: gradeScales.id }).from(gradeScales).where(eq(gradeScales.id, body.gradeScaleId));
      if (!scale) throw new BadRequestException('Unknown grade scale');
      const values = { name: body.name, credits: body.credits, passRules: body.passRules, gradeScaleId: body.gradeScaleId, ...(body.maxAttempts ? { maxAttempts: body.maxAttempts } : {}) };
      const [existing] = await tx.select().from(assessmentSchemes).where(and(eq(assessmentSchemes.subjectId, body.subjectId), eq(assessmentSchemes.academicYearId, body.academicYearId)));
      let id = existing?.id;
      if (existing) await tx.update(assessmentSchemes).set(values).where(eq(assessmentSchemes.id, existing.id));
      else [{ id }] = await tx.insert(assessmentSchemes).values({ tenantId: p.tenantId, subjectId: body.subjectId, academicYearId: body.academicYearId, createdBy: p.userId, ...values }).returning({ id: assessmentSchemes.id });
      const have = await tx.select().from(schemeComponents).where(eq(schemeComponents.schemeId, id));
      for (const h of have) if (!body.components.some((c) => c.code === h.code)) await tx.delete(schemeComponents).where(eq(schemeComponents.id, h.id));
      for (const [ord, c] of body.components.entries()) {
        const prior = have.find((h) => h.code === c.code);
        if (prior) await tx.update(schemeComponents).set({ name: c.name, kind: c.kind, weight: c.weight, ord, bestOf: c.bestOf ?? null }).where(eq(schemeComponents.id, prior.id));
        else await tx.insert(schemeComponents).values({ tenantId: p.tenantId, schemeId: id, code: c.code, name: c.name, kind: c.kind, weight: c.weight, ord, bestOf: c.bestOf ?? null });
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: existing ? 'scheme.updated' : 'scheme.created', subjectType: 'assessment_scheme', subjectId: id, data: { subjectId: body.subjectId, credits: body.credits, components: body.components.length } });
      return this.load(tx, body.subjectId, body.academicYearId);
    });
  }

  @Get('schemes/:id')
  @Auth('user', STAFF)
  async one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(assessmentSchemes).where(eq(assessmentSchemes.id, id));
      if (!s) throw new NotFoundException('Scheme not found');
      return this.load(tx, s.subjectId, s.academicYearId);
    });
  }

  private async load(tx: Tx, subjectId: string, academicYearId: string) {
    const [s] = await tx.select().from(assessmentSchemes).where(and(eq(assessmentSchemes.subjectId, subjectId), eq(assessmentSchemes.academicYearId, academicYearId)));
    if (!s) return undefined;
    const components = await tx.select().from(schemeComponents).where(eq(schemeComponents.schemeId, s.id)).orderBy(asc(schemeComponents.ord));
    return { ...s, components };
  }
}
