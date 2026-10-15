import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { obeTargets, peoMissionMap, programOutcomeVersions } from '../db/schema-obe-depth.js';
import { academicYears, programs, assessmentCoMap, assessments, attainmentSnapshots, coOutcomeMap, coSets, courseOutcomes, improvementActions, marks, programOutcomes, sections, students, subjects } from '../db/schema.js';
import { levelFor } from './attainment.js';
import { checkCo } from './bloom.js';
import { ObeService } from './obe.service.js';

const OBE_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const MANAGE: RoleName[] = [...OBE_ADMIN, 'hod'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'quality_officer'];

const PeoMissionBody = z.object({ cells: z.array(z.object({ peoId: z.uuid(), missionId: z.uuid(), strength: z.number().int().min(0).max(3), justification: z.string().trim().max(500).optional() })).max(400) });
const VersionBody = z.object({ effectiveFrom: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Give the academic year it applies from, like 2026-27'), note: z.string().trim().max(500).optional() });
const TargetsBody = z.object({
  academicYearId: z.uuid(),
  targets: z.array(z.object({ targetId: z.uuid(), targetLevel: z.number().min(0).max(10).nullable(), thresholdPercent: z.number().gt(0).max(100).nullish(), rationale: z.string().trim().max(500).optional() })).max(2000),
});
const CopyTargetsBody = z.object({ fromYearId: z.uuid(), toYearId: z.uuid() });
const GapsBody = z.object({ academicYearId: z.uuid(), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const CheckBody = z.object({ statement: z.string().trim().min(1).max(1000), bloomLevel: z.string().trim().max(40).optional() });

/**
 * OBE depth (migration 0160): the PEO-mission consistency matrix, published versions of a programme's statements,
 * Bloom verb checks of course outcomes, attainment targets per outcome and year, student-wise CO attainment, the
 * attainment trend across years and batches, improvement actions raised from gaps, and the programme's OBE readiness.
 */
@Controller('v1/obe')
export class ObeDepthController {
  constructor(
    private readonly db: DbService,
    private readonly obe: ObeService,
  ) {}

  /** Programmes, academic years and courses for the OBE pages' pickers: OBE staff (the quality officer among them) cannot read the admin structure. */
  @Get('structure')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  structure(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      academicYears: await tx.select({ id: academicYears.id, label: academicYears.label, isCurrent: academicYears.isCurrent }).from(academicYears).orderBy(desc(academicYears.startsOn)),
      programs: await tx.select({ id: programs.id, name: programs.name, level: programs.level, campusId: programs.campusId, termCount: programs.termCount }).from(programs).orderBy(asc(programs.name)),
      subjects: await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, programId: subjects.programId, term: subjects.term, courseId: subjects.courseId }).from(subjects).orderBy(asc(subjects.code)),
      sections: await tx.select({ id: sections.id, name: sections.displayName, programId: sections.programId, term: sections.term, academicYearId: sections.academicYearId }).from(sections).orderBy(asc(sections.displayName)),
    }));
  }

  // --- PEO-mission matrix -----------------------------------------------------------------------

  @Get('programs/:programId/peo-mission')
  @Auth('user', STAFF)
  peoMission(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const rows = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, programId), inArray(programOutcomes.kind, ['peo', 'mission']))).orderBy(asc(programOutcomes.ord), asc(programOutcomes.code));
      const cells = await tx.select().from(peoMissionMap).where(eq(peoMissionMap.programId, programId));
      return { peos: rows.filter((r) => r.kind === 'peo'), missions: rows.filter((r) => r.kind === 'mission'), cells: cells.map((c) => ({ peoId: c.peoId, missionId: c.missionId, strength: c.strength, justification: c.justification ?? '' })) };
    });
  }

  /** Replaces the matrix; every PEO must serve at least one mission element. */
  @Put('programs/:programId/peo-mission')
  @Auth('user', OBE_ADMIN)
  savePeoMission(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(PeoMissionBody)) body: z.infer<typeof PeoMissionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const rows = await tx.select({ id: programOutcomes.id, kind: programOutcomes.kind, code: programOutcomes.code }).from(programOutcomes).where(eq(programOutcomes.programId, programId));
      const peos = new Set(rows.filter((r) => r.kind === 'peo').map((r) => r.id));
      const missions = new Set(rows.filter((r) => r.kind === 'mission').map((r) => r.id));
      if (body.cells.some((c) => !peos.has(c.peoId) || !missions.has(c.missionId))) throw new BadRequestException('The matrix has a PEO or mission element of another programme');
      const keep = body.cells.filter((c) => c.strength > 0);
      const orphan = rows.filter((r) => r.kind === 'peo' && !keep.some((c) => c.peoId === r.id)).map((r) => r.code);
      if (orphan.length && keep.length) throw new BadRequestException(`Map ${orphan.join(', ')} to at least one element of the mission`);
      await tx.delete(peoMissionMap).where(eq(peoMissionMap.programId, programId));
      if (keep.length) await tx.insert(peoMissionMap).values(keep.map((c) => ({ tenantId: p.tenantId, programId, peoId: c.peoId, missionId: c.missionId, strength: c.strength, justification: c.justification?.trim() || null })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.peo_mission.saved', subjectType: 'program', subjectId: programId, data: { cells: keep.length } });
      return { cells: keep.length };
    });
  }

  // --- Published versions of the statements -----------------------------------------------------

  @Get('programs/:programId/versions')
  @Auth('user', STAFF)
  versions(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(programOutcomeVersions).where(eq(programOutcomeVersions.programId, programId)).orderBy(desc(programOutcomeVersions.version));
      const current = await this.statements(tx, programId);
      const latest = rows[0];
      return { versions: rows, current, changedSinceLatest: latest ? diff(latest.statements, current) : null };
    });
  }

  /** Publishes the programme's current statements as a new version from an academic year (refused when nothing changed). */
  @Post('programs/:programId/versions')
  @Auth('user', OBE_ADMIN)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(VersionBody)) body: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const current = await this.statements(tx, programId);
      if (!current.length) throw new BadRequestException('Add the vision, mission, PEOs and POs first');
      const [latest] = await tx.select().from(programOutcomeVersions).where(eq(programOutcomeVersions.programId, programId)).orderBy(desc(programOutcomeVersions.version)).limit(1);
      if (latest) {
        const d = diff(latest.statements, current);
        if (!d.added.length && !d.removed.length && !d.changed.length) throw new ConflictException('Nothing has changed since version ' + latest.version);
        if (body.effectiveFrom < latest.effectiveFrom) throw new BadRequestException(`A new version cannot apply before version ${latest.version} (${latest.effectiveFrom})`);
      }
      const [row] = await tx.insert(programOutcomeVersions).values({ tenantId: p.tenantId, programId, version: (latest?.version ?? 0) + 1, effectiveFrom: body.effectiveFrom, note: body.note ?? null, statements: current, publishedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.outcomes.published', subjectType: 'program', subjectId: programId, data: { version: row.version, effectiveFrom: body.effectiveFrom } });
      return row;
    });
  }

  private async statements(tx: Tx, programId: string) {
    return (await tx.select({ kind: programOutcomes.kind, code: programOutcomes.code, statement: programOutcomes.statement }).from(programOutcomes).where(eq(programOutcomes.programId, programId)).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord), asc(programOutcomes.code))).map((r) => ({ kind: r.kind as string, code: r.code, statement: r.statement }));
  }

  // --- Bloom verb check ----------------------------------------------------------------------------

  @Post('check-co')
  @HttpCode(200)
  @Auth('user', STAFF)
  checkStatement(@Body(new ZodBody(CheckBody)) body: z.infer<typeof CheckBody>) {
    return checkCo(body.statement, body.bloomLevel);
  }

  // --- Targets -------------------------------------------------------------------------------------

  /** Every CO (active versions) and PO/PSO of the programme with the programme's default target and this year's own target. */
  @Get('programs/:programId/targets')
  @Auth('user', MANAGE)
  targets(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cfg = await this.obe.config(tx, programId);
      const items = await this.outcomeItems(tx, programId);
      const own = new Map((await tx.select().from(obeTargets).where(and(eq(obeTargets.programId, programId), eq(obeTargets.academicYearId, academicYearId)))).map((t) => [t.targetId, t]));
      return {
        defaultLevel: cfg.targetLevel,
        defaultThreshold: cfg.studentThresholdPercent,
        maxLevel: cfg.maxLevel,
        rows: items.map((i) => ({ ...i, targetLevel: own.get(i.targetId)?.targetLevel ?? null, thresholdPercent: own.get(i.targetId)?.thresholdPercent ?? null, rationale: own.get(i.targetId)?.rationale ?? '' })),
      };
    });
  }

  /** Sets this year's targets; a null level removes the outcome's own target so the programme default applies. */
  @Put('programs/:programId/targets')
  @Auth('user', MANAGE)
  setTargets(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(TargetsBody)) body: z.infer<typeof TargetsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cfg = await this.obe.config(tx, programId);
      const items = new Map((await this.outcomeItems(tx, programId)).map((i) => [i.targetId, i]));
      let set = 0;
      let cleared = 0;
      for (const t of body.targets) {
        const item = items.get(t.targetId);
        if (!item) throw new BadRequestException('A target is for an outcome of another programme');
        if (t.targetLevel !== null && t.targetLevel > cfg.maxLevel) throw new BadRequestException(`A target cannot be above level ${cfg.maxLevel}`);
        if (t.thresholdPercent && item.scope !== 'co') throw new BadRequestException('A student threshold applies to course outcomes only');
        if (t.targetLevel === null) {
          cleared += (await tx.delete(obeTargets).where(and(eq(obeTargets.academicYearId, body.academicYearId), eq(obeTargets.targetId, t.targetId))).returning({ id: obeTargets.id })).length;
          continue;
        }
        await tx
          .insert(obeTargets)
          .values({ tenantId: p.tenantId, programId, academicYearId: body.academicYearId, scope: item.scope, targetId: t.targetId, code: item.code, targetLevel: t.targetLevel, thresholdPercent: t.thresholdPercent ?? null, rationale: t.rationale || null, setBy: p.userId })
          .onConflictDoUpdate({ target: [obeTargets.academicYearId, obeTargets.targetId], set: { targetLevel: t.targetLevel, thresholdPercent: t.thresholdPercent ?? null, rationale: t.rationale || null, setBy: p.userId, updatedAt: new Date() } });
        set++;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.targets.set', subjectType: 'program', subjectId: programId, data: { academicYearId: body.academicYearId, set, cleared } });
      return { set, cleared };
    });
  }

  /** Copies one year's targets to another (for the next offering), keeping targets already set there. */
  @Post('programs/:programId/targets/copy')
  @HttpCode(200)
  @Auth('user', MANAGE)
  copyTargets(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(CopyTargetsBody)) body: z.infer<typeof CopyTargetsBody>) {
    if (body.fromYearId === body.toYearId) throw new BadRequestException('Choose two different years');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const from = await tx.select().from(obeTargets).where(and(eq(obeTargets.programId, programId), eq(obeTargets.academicYearId, body.fromYearId)));
      if (!from.length) throw new BadRequestException('That year has no targets to copy');
      const rows = await tx
        .insert(obeTargets)
        .values(from.map((t) => ({ tenantId: p.tenantId, programId, academicYearId: body.toYearId, scope: t.scope, targetId: t.targetId, code: t.code, targetLevel: t.targetLevel, thresholdPercent: t.thresholdPercent, rationale: t.rationale, setBy: p.userId })))
        .onConflictDoNothing()
        .returning({ id: obeTargets.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.targets.copied', subjectType: 'program', subjectId: programId, data: { ...body, copied: rows.length } });
      return { copied: rows.length, kept: from.length - rows.length };
    });
  }

  private async outcomeItems(tx: Tx, programId: string) {
    const subs = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name }).from(subjects).where(eq(subjects.programId, programId)).orderBy(asc(subjects.term), asc(subjects.code));
    const cos = subs.length
      ? await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code, statement: courseOutcomes.statement, subjectId: coSets.subjectId }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(and(inArray(coSets.subjectId, subs.map((s) => s.id)), eq(coSets.status, 'active'))).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code))
      : [];
    const pos = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, programId), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord), asc(programOutcomes.code));
    const sub = new Map(subs.map((s) => [s.id, s]));
    return [
      ...subs.flatMap((s) => cos.filter((c) => c.subjectId === s.id).map((c) => ({ scope: 'co' as const, targetId: c.id, code: `${s.code}/${c.code}`, statement: c.statement, subject: `${sub.get(c.subjectId)?.code} ${sub.get(c.subjectId)?.name}` }))),
      ...pos.map((o) => ({ scope: 'po' as const, targetId: o.id, code: o.code, statement: o.statement, subject: null as string | null })),
    ];
  }

  // --- Student-wise CO attainment ---------------------------------------------------------------------

  /**
   * Each student's share of the marks mapped to each CO of a subject in a year (all assessments pooled), whether they
   * reached the threshold, and the class's share of students who did with the level it gives.
   */
  @Get('programs/:programId/attainment/students')
  @Auth('user', [...MANAGE, 'teacher'])
  studentWise(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string, @Query('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sub] = await tx.select().from(subjects).where(and(eq(subjects.id, subjectId), eq(subjects.programId, programId)));
      if (!sub) throw new NotFoundException('Subject not found in this programme');
      const cfg = (await this.obe.policy(tx, programId, subjectId, academicYearId)).config;
      const [set] = await tx.select().from(coSets).where(and(eq(coSets.subjectId, subjectId), eq(coSets.status, 'active')));
      if (!set) return { subject: { code: sub.code, name: sub.name }, threshold: cfg.studentThresholdPercent, cos: [], students: [] };
      const cos = await tx.select().from(courseOutcomes).where(eq(courseOutcomes.coSetId, set.id)).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code));
      const own = new Map((await tx.select().from(obeTargets).where(and(eq(obeTargets.academicYearId, academicYearId), inArray(obeTargets.targetId, cos.length ? cos.map((c) => c.id) : [subjectId])))).map((t) => [t.targetId, t]));
      // Question-wise marks, apportioned totals and assessment shares, pooled over CIE and SEE for each student.
      const evidence = await this.obe.courseEvidence(tx, [subjectId], academicYearId, () => cfg);
      const per = new Map<string, Map<string, { s: number; m: number }>>();
      for (const c of cos)
        for (const it of evidence.get(c.id) ?? [])
          for (const sc of it.scores) {
            const byCo = per.get(sc.studentId) ?? new Map();
            const cur = byCo.get(c.id) ?? { s: 0, m: 0 };
            cur.s += sc.scored ?? 0;
            cur.m += sc.max;
            byCo.set(c.id, cur);
            per.set(sc.studentId, byCo);
          }
      const ids = [...per.keys()];
      const people = ids.length ? await tx.select({ id: students.id, name: students.fullName, roll: students.rollNo }).from(students).where(inArray(students.id, ids)).orderBy(asc(students.rollNo)) : [];
      const threshold = (coId: string) => own.get(coId)?.thresholdPercent ?? cfg.studentThresholdPercent;
      const studentsOut = people.map((s) => ({
        id: s.id,
        name: s.name,
        rollNo: s.roll,
        cos: cos.map((c) => {
          const x = per.get(s.id)?.get(c.id);
          const pct = x && x.m > 0 ? Math.round((x.s / x.m) * 1000) / 10 : null;
          return { coId: c.id, percent: pct, attained: pct === null ? null : pct + 1e-9 >= threshold(c.id) };
        }),
      }));
      const cosOut = cos.map((c, i) => {
        const measured = studentsOut.filter((s) => s.cos[i].percent !== null);
        const attained = measured.filter((s) => s.cos[i].attained).length;
        const share = measured.length ? Math.round((attained / measured.length) * 1000) / 10 : null;
        return { id: c.id, code: c.code, statement: c.statement, threshold: threshold(c.id), measured: measured.length, attained, percentAttained: share, level: share === null ? null : levelFor(cfg, share), target: own.get(c.id)?.targetLevel ?? cfg.targetLevel };
      });
      return { subject: { code: sub.code, name: sub.name }, threshold: cfg.studentThresholdPercent, cos: cosOut, students: studentsOut };
    });
  }

  // --- Trend across years -----------------------------------------------------------------------------

  /** The latest computed attainment of every PO/PSO (and the CO summary) for each academic year with a computation. */
  @Get('programs/:programId/attainment/trend')
  @Auth('user', MANAGE)
  trendAcrossYears(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ yearId: attainmentSnapshots.academicYearId, year: academicYears.label, startsOn: academicYears.startsOn, scope: attainmentSnapshots.scope, code: attainmentSnapshots.code, combined: attainmentSnapshots.combined, target: attainmentSnapshots.target, met: attainmentSnapshots.met, at: attainmentSnapshots.computedAt })
        .from(attainmentSnapshots)
        .innerJoin(academicYears, eq(academicYears.id, attainmentSnapshots.academicYearId))
        .where(and(eq(attainmentSnapshots.programId, programId), sql`${attainmentSnapshots.computedAt} = (select max(x.computed_at) from attainment_snapshots x where x.program_id = ${programId} and x.academic_year_id = ${attainmentSnapshots.academicYearId})`))
        .orderBy(asc(academicYears.startsOn), asc(attainmentSnapshots.code));
      const years = [...new Map(rows.map((r) => [r.yearId, { id: r.yearId, label: r.year }])).values()];
      const outcomes = [...new Set(rows.filter((r) => r.scope === 'po').map((r) => r.code))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      return {
        years,
        outcomes: outcomes.map((code) => ({ code, values: years.map((y) => rows.find((r) => r.yearId === y.id && r.scope === 'po' && r.code === code)?.combined ?? null), target: rows.filter((r) => r.scope === 'po' && r.code === code).at(-1)?.target ?? null })),
        courses: years.map((y) => {
          const cos = rows.filter((r) => r.yearId === y.id && r.scope === 'co');
          return { yearId: y.id, cos: cos.length, met: cos.filter((r) => r.met).length };
        }),
      };
    });
  }

  // --- Improvement actions from gaps ------------------------------------------------------------------

  /** Opens an improvement action for every outcome short of its target in the year's latest computation that has none open. */
  @Post('programs/:programId/actions/from-gaps')
  @HttpCode(200)
  @Auth('user', MANAGE)
  fromGaps(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(GapsBody)) body: z.infer<typeof GapsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { rows } = await this.obe.latest(tx, programId, body.academicYearId);
      if (!rows.length) throw new BadRequestException('Compute the attainment for this year first');
      const gaps = rows.filter((r) => !r.met && r.gap !== null);
      const open = new Set((await tx.select({ t: improvementActions.targetId }).from(improvementActions).where(and(eq(improvementActions.programId, programId), inArray(improvementActions.status, ['open', 'in_progress'])))).map((r) => r.t));
      const todo = gaps.filter((g) => !open.has(g.targetId));
      if (todo.length)
        await tx.insert(improvementActions).values(
          todo.map((g) => ({
            tenantId: p.tenantId,
            programId,
            scope: g.scope,
            targetId: g.targetId,
            code: g.code,
            academicYearId: body.academicYearId,
            title: `Close the attainment gap of ${g.code} (${g.combined} against a target of ${g.target})`,
            baselineValue: g.combined,
            targetValue: g.target,
            dueOn: body.dueOn ?? null,
            createdBy: p.userId,
          })),
        );
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.actions.from_gaps', subjectType: 'program', subjectId: programId, data: { academicYearId: body.academicYearId, created: todo.length } });
      return { gaps: gaps.length, created: todo.length, alreadyOpen: gaps.length - todo.length };
    });
  }

  // --- Readiness ------------------------------------------------------------------------------------------

  /** How complete the programme's OBE set-up is, item by item, as NBA criterion 1-3 reviewers check it. */
  @Get('programs/:programId/readiness')
  @Auth('user', MANAGE)
  readiness(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId') academicYearId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const st = await tx.select({ kind: programOutcomes.kind, id: programOutcomes.id }).from(programOutcomes).where(eq(programOutcomes.programId, programId));
      const n = (k: string) => st.filter((s) => s.kind === k).length;
      const subs = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.programId, programId));
      const sets = subs.length ? await tx.select({ id: coSets.id, subjectId: coSets.subjectId }).from(coSets).where(and(inArray(coSets.subjectId, subs.map((s) => s.id)), eq(coSets.status, 'active'))) : [];
      const cos = sets.length ? await tx.select().from(courseOutcomes).where(inArray(courseOutcomes.coSetId, sets.map((s) => s.id))) : [];
      const cells = cos.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id))) : [];
      const mapped = new Set(cells.map((c) => c.coId));
      const assessed = new Set(cos.length ? (await tx.select({ coId: assessmentCoMap.coId }).from(assessmentCoMap).where(inArray(assessmentCoMap.coId, cos.map((c) => c.id)))).map((r) => r.coId) : []);
      const pm = await tx.select().from(peoMissionMap).where(eq(peoMissionMap.programId, programId));
      const [ver] = await tx.select({ v: programOutcomeVersions.version, from: programOutcomeVersions.effectiveFrom }).from(programOutcomeVersions).where(eq(programOutcomeVersions.programId, programId)).orderBy(desc(programOutcomeVersions.version)).limit(1);
      const targets = academicYearId && z.uuid().safeParse(academicYearId).success ? (await tx.select({ n: sql<number>`count(*)::int` }).from(obeTargets).where(and(eq(obeTargets.programId, programId), eq(obeTargets.academicYearId, academicYearId))))[0].n : 0;
      const verbs = cos.filter((c) => !checkCo(c.statement, c.bloomLevel).ok).length;
      const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
      const items = [
        { key: 'statements', done: n('vision') > 0 && n('mission') > 0 && n('peo') > 0 && n('po') > 0, detail: `${n('vision')} vision, ${n('mission')} mission, ${n('peo')} PEOs, ${n('po')} POs, ${n('pso')} PSOs` },
        { key: 'published', done: !!ver, detail: ver ? `Version ${ver.v} from ${ver.from}` : 'Not published' },
        { key: 'peoMission', done: n('peo') > 0 && st.filter((s) => s.kind === 'peo').every((s) => pm.some((c) => c.peoId === s.id)), detail: `${new Set(pm.map((c) => c.peoId)).size} of ${n('peo')} PEOs mapped` },
        { key: 'cos', done: subs.length > 0 && sets.length === subs.length, detail: `${sets.length} of ${subs.length} courses have active COs` },
        { key: 'verbs', done: cos.length > 0 && verbs === 0, detail: `${verbs} of ${cos.length} COs need a better action verb or Bloom level` },
        { key: 'mapped', done: cos.length > 0 && mapped.size === cos.length, detail: `${pct(mapped.size, cos.length)}% of COs mapped to a PO or PSO` },
        { key: 'justified', done: cells.length > 0 && cells.every((c) => !!c.justification?.trim()), detail: `${cells.filter((c) => !!c.justification?.trim()).length} of ${cells.length} mappings justified` },
        { key: 'assessed', done: cos.length > 0 && assessed.size === cos.length, detail: `${pct(assessed.size, cos.length)}% of COs tied to an assessment` },
        { key: 'targets', done: targets > 0, detail: `${targets} outcomes with a target for the year` },
      ];
      return { items, score: pct(items.filter((i) => i.done).length, items.length) };
    });
  }
}

/** What changed between two sets of statements: by kind and code. */
function diff(before: { kind: string; code: string; statement: string }[], after: { kind: string; code: string; statement: string }[]) {
  const key = (s: { kind: string; code: string }) => `${s.kind}|${s.code}`;
  const was = new Map(before.map((s) => [key(s), s]));
  const now = new Map(after.map((s) => [key(s), s]));
  return {
    added: after.filter((s) => !was.has(key(s))),
    removed: before.filter((s) => !now.has(key(s))),
    changed: after.filter((s) => was.has(key(s)) && was.get(key(s))!.statement !== s.statement).map((s) => ({ ...s, before: was.get(key(s))!.statement })),
  };
}
