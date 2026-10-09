import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { accreditationCriteria, accreditationFrameworks } from '../db/schema-depth.js';
import { assessmentCoMap, assessments, coSets, courseOutcomes, evalMarks, evalQuestions, examPapers, improvementActions, obeEvidence, programs } from '../db/schema.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { cqiState, frameworkScore, HARVEST_SOURCES, type HarvestSource, scoreTree, TEMPLATES, type TemplateCriterion } from './quality.logic.js';

const MANAGE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const MAX_FILE = 10 * 1024 * 1024;
const num = z.number().min(-1e9).max(1e9);

const FrameworkBody = z.object({ body: z.enum(['naac', 'nba', 'nirf', 'iqac', 'custom']).default('custom'), name: z.string().trim().min(2).max(160), version: z.string().trim().max(40).default(''), template: z.enum(['naac', 'nba', 'nirf']).nullish() });
const F = {
  code: z.string().trim().min(1).max(24),
  title: z.string().trim().min(2).max(300),
  metric: z.string().trim().max(300),
  unit: z.string().trim().max(24),
  target: num.nullish(),
  weight: z.number().min(0).max(1000),
  ownerId: z.uuid().nullish(),
  /** Where the evidence engine reads the figure from (placements, exams, surveys …); empty = entered by hand. */
  harvestSource: z.enum(['', ...HARVEST_SOURCES]),
  sort: z.number().int().min(0).max(10000),
};
const CriterionBody = z.object({ parentId: z.uuid().nullish(), ...F, metric: F.metric.default(''), unit: F.unit.default(''), weight: F.weight.default(1), harvestSource: F.harvestSource.default(''), sort: F.sort.default(0) });
// The patch has no defaults, so a field left out stays as it is.
const CriterionPatch = z.object({ ...F, actual: num.nullish() }).partial();
const EvidenceBody = z.object({ title: z.string().trim().min(2).max(200), url: z.url().optional(), note: z.string().trim().max(2000).optional() });
const RcaBody = z.object({ rootCause: z.string().trim().min(3).max(2000), baselineValue: num.nullish(), targetValue: num.nullish(), remeasureOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() });
const RemeasureBody = z.object({ value: num, note: z.string().trim().max(1000).default('') });
const QuestionCoBody = z.object({ coId: z.uuid().nullable() });

type Source = { value: number | null; label: string };

/** Accreditation criteria trees, the evidence engine, the closed CQI loop and per-question outcome tagging (PRD sections 24 and 28). */
@Controller('v1/quality')
export class QualityController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly storage: ObjectStorage,
    private readonly scans: UploadScanService,
  ) {}

  private today() {
    return this.clock.now().toISOString().slice(0, 10);
  }

  // ---- frameworks and criteria -----------------------------------------------------------------------------

  @Get('frameworks')
  @Auth('user', MANAGE)
  frameworks(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fws = await tx.select().from(accreditationFrameworks).orderBy(asc(accreditationFrameworks.createdAt));
      const crit = fws.length ? await tx.select().from(accreditationCriteria).where(inArray(accreditationCriteria.frameworkId, fws.map((f) => f.id))) : [];
      return fws.map((f) => {
        const mine = crit.filter((c) => c.frameworkId === f.id);
        return { ...f, criteria: mine.length, withFigure: mine.filter((c) => c.actual !== null).length, score: frameworkScore(mine) };
      });
    });
  }

  /** Creates a framework, optionally pre-filled from a ready-made template (NAAC, NBA, NIRF) that the institution then edits. */
  @Post('frameworks')
  @Auth('user', ADMIN)
  createFramework(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FrameworkBody)) b: z.infer<typeof FrameworkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fw] = await tx.insert(accreditationFrameworks).values({ tenantId: p.tenantId, body: b.template ?? b.body, name: b.name, version: b.version, createdBy: p.userId }).returning();
      if (b.template) {
        let sort = 0;
        const add = async (items: TemplateCriterion[], parentId: string | null) => {
          for (const c of items) {
            const [row] = await tx.insert(accreditationCriteria).values({ tenantId: p.tenantId, frameworkId: fw.id, parentId, code: c.code, title: c.title, metric: c.metric ?? '', unit: c.unit ?? '', target: c.target ?? null, weight: c.weight ?? 1, harvestSource: c.harvestSource ?? '', sort: sort++ }).returning({ id: accreditationCriteria.id });
            if (c.children) await add(c.children, row.id);
          }
        };
        await add(TEMPLATES[b.template].criteria, null);
      }
      await auditUser(tx, p, 'quality.framework_created', 'accreditation_framework', fw.id, { template: b.template ?? null });
      return fw;
    });
  }

  @Post('frameworks/:id/status')
  @HttpCode(200)
  @Auth('user', ADMIN)
  setStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['draft', 'active', 'archived']) }))) b: { status: 'draft' | 'active' | 'archived' }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(accreditationFrameworks).set({ status: b.status }).where(eq(accreditationFrameworks.id, id)).returning();
      if (!row) throw new NotFoundException('Framework not found');
      await auditUser(tx, p, 'quality.framework_status', 'accreditation_framework', id, { status: b.status });
      return row;
    });
  }

  /** The framework with every criterion, its score and its evidence count. */
  @Get('frameworks/:id')
  @Auth('user', MANAGE)
  framework(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fw] = await tx.select().from(accreditationFrameworks).where(eq(accreditationFrameworks.id, id));
      if (!fw) throw new NotFoundException('Framework not found');
      const crit = await tx.select().from(accreditationCriteria).where(eq(accreditationCriteria.frameworkId, id)).orderBy(asc(accreditationCriteria.sort), asc(accreditationCriteria.code));
      const scores = scoreTree(crit);
      const ev = crit.length ? await tx.select({ target: obeEvidence.targetId, n: sql<number>`count(*)::int` }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'criterion'), inArray(obeEvidence.targetId, crit.map((c) => c.id)))).groupBy(obeEvidence.targetId) : [];
      return { ...fw, score: frameworkScore(crit), criteria: crit.map((c) => ({ ...c, score: scores.get(c.id) ?? null, evidence: ev.find((e) => e.target === c.id)?.n ?? 0 })) };
    });
  }

  @Post('frameworks/:id/criteria')
  @Auth('user', ADMIN)
  addCriterion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CriterionBody)) b: z.infer<typeof CriterionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fw] = await tx.select({ id: accreditationFrameworks.id }).from(accreditationFrameworks).where(eq(accreditationFrameworks.id, id));
      if (!fw) throw new NotFoundException('Framework not found');
      if (b.parentId) {
        const [par] = await tx.select({ id: accreditationCriteria.id }).from(accreditationCriteria).where(and(eq(accreditationCriteria.id, b.parentId), eq(accreditationCriteria.frameworkId, id)));
        if (!par) throw new BadRequestException('The parent criterion is not in this framework');
      }
      const [dup] = await tx.select({ id: accreditationCriteria.id }).from(accreditationCriteria).where(and(eq(accreditationCriteria.frameworkId, id), eq(accreditationCriteria.code, b.code)));
      if (dup) throw new ConflictException(`Criterion ${b.code} already exists`);
      const [row] = await tx.insert(accreditationCriteria).values({ tenantId: p.tenantId, frameworkId: id, parentId: b.parentId ?? null, code: b.code, title: b.title, metric: b.metric, unit: b.unit, target: b.target ?? null, weight: b.weight, ownerId: b.ownerId ?? null, harvestSource: b.harvestSource, sort: b.sort }).returning();
      await auditUser(tx, p, 'quality.criterion_added', 'accreditation_criterion', row.id);
      return row;
    });
  }

  /** Edits a criterion. The administrator changes anything; the criterion's owner can record the figure. */
  @Put('criteria/:id')
  @Auth('user', MANAGE)
  updateCriterion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CriterionPatch)) b: z.infer<typeof CriterionPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(accreditationCriteria).where(eq(accreditationCriteria.id, id));
      if (!c) throw new NotFoundException('Criterion not found');
      const admin = p.roles.some((r) => ADMIN.includes(r));
      if (!admin) {
        const onlyFigure = Object.keys(b).every((k) => k === 'actual');
        if (c.ownerId !== p.userId || !onlyFigure) throw new ForbiddenException('Only the owner can record the figure; other changes need an administrator');
      }
      const set: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) if (v !== undefined) set[k] = v;
      if (Object.keys(set).length === 0) throw new BadRequestException('Nothing to change');
      const [row] = await tx.update(accreditationCriteria).set(set).where(eq(accreditationCriteria.id, id)).returning();
      await auditUser(tx, p, 'quality.criterion_updated', 'accreditation_criterion', id);
      return row;
    });
  }

  @Delete('criteria/:id')
  @HttpCode(200)
  @Auth('user', ADMIN)
  deleteCriterion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(accreditationCriteria).where(eq(accreditationCriteria.id, id));
      if (!c) throw new NotFoundException('Criterion not found');
      const all = await tx.select({ id: accreditationCriteria.id, parentId: accreditationCriteria.parentId }).from(accreditationCriteria).where(eq(accreditationCriteria.frameworkId, c.frameworkId));
      const doomed = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const n of all) if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) (doomed.add(n.id), (grew = true));
      }
      await tx.delete(obeEvidence).where(and(eq(obeEvidence.scope, 'criterion'), inArray(obeEvidence.targetId, [...doomed])));
      await tx.delete(accreditationCriteria).where(inArray(accreditationCriteria.id, [...doomed]));
      await auditUser(tx, p, 'quality.criterion_deleted', 'accreditation_criterion', id, { removed: doomed.size });
      return { removed: doomed.size };
    });
  }

  // ---- evidence engine ---------------------------------------------------------------------------------------

  private async source(tx: Tx, key: HarvestSource): Promise<Source> {
    const one = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)).rows[0] ?? {}) as { v?: number | string | null };
    const n = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);
    switch (key) {
      case 'students':
        return { value: n((await one(sql`select count(*)::int as v from students where status in ('enrolled', 'active')`)).v), label: 'Students on roll' };
      case 'staff':
        return { value: n((await one(sql`select count(*)::int as v from staff_profiles where status = 'active'`)).v), label: 'Active staff' };
      case 'exam_pass_rate':
        return {
          value: n((await one(sql`select round(100.0 * count(*) filter (where r.outcome = 'pass') / nullif(count(*), 0), 2) as v from exam_results r where r.session_id = (select id from exam_sessions where status in ('published', 'locked') order by published_at desc nulls last limit 1)`)).v),
          label: 'Pass percentage in the latest published session',
        };
      case 'placement_rate':
        return { value: n((await one(sql`select round(100.0 * (select count(distinct student_id) from drive_registrations where status = 'selected') / nullif((select count(*) from students where status in ('enrolled', 'active')), 0), 2) as v`)).v), label: 'Students placed (selected in a drive)' };
      case 'feedback_rating':
        return { value: n((await one(sql`select round(avg(rating)::numeric, 2) as v from survey_answers where rating is not null`)).v), label: 'Average feedback rating' };
      case 'publications':
        return { value: n((await one(sql`select count(*)::int as v from publications`)).v), label: 'Publications recorded' };
      case 'lms_items':
        return { value: n((await one(sql`select count(*)::int as v from lms_items`)).v), label: 'Items on the learning platform' };
      case 'course_files':
        return { value: n((await one(sql`select count(*)::int as v from course_files where reviewed_at is not null`)).v), label: 'Course files reviewed' };
      case 'grievance_resolution':
        return { value: n((await one(sql`select round(100.0 * count(*) filter (where resolved_at is not null) / nullif(count(*), 0), 2) as v from grievance_tickets`)).v), label: 'Grievances resolved' };
      case 'committee_meetings':
        return { value: n((await one(sql`select count(*)::int as v from committee_meetings`)).v), label: 'Committee meetings held' };
    }
  }

  /**
   * Reads each criterion's figure from the modules that already hold it (students, exams, placements, surveys,
   * committees …), stores it as the criterion's figure and keeps one dated evidence line per criterion.
   */
  @Post('frameworks/:id/harvest')
  @HttpCode(200)
  @Auth('user', ADMIN)
  harvest(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const crit = await tx.select().from(accreditationCriteria).where(and(eq(accreditationCriteria.frameworkId, id), sql`${accreditationCriteria.harvestSource} <> ''`));
      const today = this.today();
      const cache = new Map<string, Source>();
      const done: { code: string; source: string; value: number | null }[] = [];
      for (const c of crit) {
        const key = c.harvestSource as HarvestSource;
        if (!HARVEST_SOURCES.includes(key)) continue;
        const src = cache.get(key) ?? (await this.source(tx, key));
        cache.set(key, src);
        if (src.value === null) continue;
        await tx.update(accreditationCriteria).set({ actual: src.value }).where(eq(accreditationCriteria.id, c.id));
        await tx.execute(sql`
          insert into obe_evidence (tenant_id, scope, target_id, title, note, uploaded_by, source, source_ref)
          values (${p.tenantId}::uuid, 'criterion', ${c.id}::uuid, ${`${src.label}: ${src.value}${c.unit ? ' ' + c.unit : ''}`}, ${`Collected automatically from the ${key.replace(/_/g, ' ')} records on ${today}.`}, ${p.userId}::uuid, ${key}, ${c.id})
          on conflict (tenant_id, source, source_ref) where source <> 'manual'
          do update set title = excluded.title, note = excluded.note, created_at = now()`);
        done.push({ code: c.code, source: key, value: src.value });
      }
      await auditUser(tx, p, 'quality.evidence_harvested', 'accreditation_framework', id, { criteria: done.length });
      return { harvested: done.length, skipped: crit.length - done.length, items: done };
    });
  }

  @Get('criteria/:id/evidence')
  @Auth('user', MANAGE)
  criterionEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: obeEvidence.id, title: obeEvidence.title, url: obeEvidence.url, note: obeEvidence.note, source: obeEvidence.source, fileName: obeEvidence.fileName, createdAt: obeEvidence.createdAt }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'criterion'), eq(obeEvidence.targetId, id))).orderBy(asc(obeEvidence.createdAt)));
  }

  @Post('criteria/:id/evidence')
  @Auth('user', MANAGE)
  addEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EvidenceBody)) b: z.infer<typeof EvidenceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select({ id: accreditationCriteria.id }).from(accreditationCriteria).where(eq(accreditationCriteria.id, id));
      if (!c) throw new NotFoundException('Criterion not found');
      const [row] = await tx.insert(obeEvidence).values({ tenantId: p.tenantId, programId: null, scope: 'criterion', targetId: id, title: b.title, url: b.url ?? null, note: b.note ?? null, uploadedBy: p.userId }).returning();
      await auditUser(tx, p, 'quality.evidence_added', 'obe_evidence', row.id);
      return row;
    });
  }

  /** Attaches a PDF, JPEG or PNG to an evidence line (multipart field `file`). */
  @Post('evidence/:id/file')
  @Auth('user', MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE, files: 1 } }))
  async uploadEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The file must be a PDF, JPEG or PNG');
    const old = await this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.select().from(obeEvidence).where(eq(obeEvidence.id, id));
      if (!e) throw new NotFoundException('Evidence not found');
      return e;
    });
    await this.scans.assertClean(file.buffer, 'The evidence file');
    const key = `tenants/${p.tenantId}/quality/evidence/${id}-${Date.now()}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_FILE, type);
    try {
      const row = await this.db.withTenant(p.tenantId, async (tx) => {
        const [r] = await tx.update(obeEvidence).set({ fileKey: key, fileName: file.originalname.slice(0, 200) }).where(eq(obeEvidence.id, id)).returning();
        await auditUser(tx, p, 'quality.evidence_file_uploaded', 'obe_evidence', id, { type });
        return r;
      });
      if (old.fileKey) await this.storage.delete(old.fileKey).catch(() => undefined);
      return row;
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  @Get('evidence/:id/file')
  @Auth('user', MANAGE)
  async evidenceFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const e = await this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(obeEvidence).where(eq(obeEvidence.id, id)))[0]);
    if (!e?.fileKey) throw new NotFoundException('No file attached');
    const { stream, size } = await this.storage.get(e.fileKey);
    res.set({ 'content-type': 'application/octet-stream', 'content-length': String(size), 'content-disposition': `attachment; filename="${(e.fileName ?? 'evidence').replace(/[^A-Za-z0-9._-]+/g, '_')}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    stream.pipe(res);
  }

  // ---- closed CQI loop ----------------------------------------------------------------------------------------

  /** Improvement actions with root cause, baseline, target and re-measurement: where each loop stands. */
  @Get('cqi')
  @Auth('user', MANAGE)
  cqi(@CurrentPrincipal() p: UserPrincipal, @Query('programId') programId?: string) {
    if (programId && !z.uuid().safeParse(programId).success) throw new BadRequestException('Choose a programme');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ a: improvementActions, program: programs.name }).from(improvementActions).innerJoin(programs, eq(programs.id, improvementActions.programId)).where(programId ? eq(improvementActions.programId, programId) : undefined).orderBy(asc(improvementActions.createdAt));
      const today = this.today();
      const items = rows.map((r) => ({ ...r.a, program: r.program, state: cqiState(r.a, today) }));
      return { items, summary: { planned: items.filter((i) => i.state === 'planned').length, inProgress: items.filter((i) => i.state === 'in_progress').length, awaiting: items.filter((i) => i.state === 'awaiting_remeasure').length, effective: items.filter((i) => i.state === 'effective').length, notEffective: items.filter((i) => i.state === 'not_effective').length } };
    });
  }

  @Put('actions/:id/root-cause')
  @Auth('user', MANAGE)
  rootCause(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RcaBody)) b: z.infer<typeof RcaBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(improvementActions).set({ rootCause: b.rootCause, baselineValue: b.baselineValue ?? null, targetValue: b.targetValue ?? null, remeasureOn: b.remeasureOn ?? null }).where(eq(improvementActions.id, id)).returning();
      if (!row) throw new NotFoundException('Action not found');
      await auditUser(tx, p, 'quality.root_cause_recorded', 'improvement_action', id);
      return row;
    });
  }

  /** Records the figure measured after the action. The loop closes: effective when the target is met, otherwise another cycle is due. */
  @Post('actions/:id/remeasure')
  @HttpCode(200)
  @Auth('user', MANAGE)
  remeasure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RemeasureBody)) b: z.infer<typeof RemeasureBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(improvementActions).where(eq(improvementActions.id, id));
      if (!a) throw new NotFoundException('Action not found');
      if (a.baselineValue === null && a.targetValue === null) throw new ConflictException('Record the root cause with a baseline and a target first');
      const effective = a.targetValue === null || b.value >= a.targetValue;
      const [row] = await tx.update(improvementActions).set({ remeasuredValue: b.value, remeasureNote: b.note, remeasuredAt: this.clock.now(), status: effective ? 'done' : 'in_progress', closedAt: effective ? this.clock.now() : null }).where(eq(improvementActions.id, id)).returning();
      await auditUser(tx, p, 'quality.action_remeasured', 'improvement_action', id, { value: b.value, effective });
      return { ...row, state: cqiState(row, this.today()) };
    });
  }

  // ---- per-question outcome tagging ---------------------------------------------------------------------------

  /** Tags a question of an exam paper with the course outcome it tests. */
  @Put('eval-questions/:id/co')
  @Auth('user', ['tenant_admin', 'principal', 'quality_officer', 'hod', 'teacher', 'exam_controller'])
  tagQuestion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(QuestionCoBody)) b: z.infer<typeof QuestionCoBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.coId) {
        const [co] = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).where(eq(courseOutcomes.id, b.coId));
        if (!co) throw new BadRequestException('Course outcome not found');
      }
      const [row] = await tx.update(evalQuestions).set({ coId: b.coId }).where(eq(evalQuestions.id, id)).returning();
      if (!row) throw new NotFoundException('Question not found');
      await auditUser(tx, p, 'quality.question_tagged', 'eval_question', id, { coId: b.coId });
      return row;
    });
  }

  /** Per question and per outcome: how the class did on the questions that test it. */
  @Get('exam-papers/:paperId/question-outcomes')
  @Auth('user', ['tenant_admin', 'principal', 'quality_officer', 'hod', 'teacher', 'exam_controller'])
  questionOutcomes(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const qs = await tx
        .select({ id: evalQuestions.id, no: evalQuestions.no, maxMarks: evalQuestions.maxMarks, coId: evalQuestions.coId, code: courseOutcomes.code, avg: sql<number | null>`avg(${evalMarks.marks})::float`, answered: sql<number>`count(${evalMarks.marks})::int` })
        .from(evalQuestions)
        .leftJoin(courseOutcomes, eq(courseOutcomes.id, evalQuestions.coId))
        .leftJoin(evalMarks, eq(evalMarks.questionId, evalQuestions.id))
        .where(eq(evalQuestions.paperId, paperId))
        .groupBy(evalQuestions.id, courseOutcomes.code)
        .orderBy(asc(evalQuestions.ord), asc(evalQuestions.no));
      const questions = qs.map((q) => ({ ...q, percent: q.avg === null || q.maxMarks <= 0 ? null : Math.round((q.avg / q.maxMarks) * 1000) / 10 }));
      const byCo = new Map<string, { coId: string; code: string; maxMarks: number; scored: number }>();
      for (const q of qs.filter((x) => x.coId && x.avg !== null)) {
        const cur = byCo.get(q.coId!) ?? { coId: q.coId!, code: q.code ?? '', maxMarks: 0, scored: 0 };
        cur.maxMarks += q.maxMarks;
        cur.scored += q.avg ?? 0;
        byCo.set(q.coId!, cur);
      }
      const outcomes = [...byCo.values()].map((o) => ({ coId: o.coId, code: o.code, maxMarks: o.maxMarks, percent: o.maxMarks > 0 ? Math.round((o.scored / o.maxMarks) * 1000) / 10 : null }));
      const [paperRow] = await tx.select({ subjectId: examPapers.subjectId }).from(examPapers).where(eq(examPapers.id, paperId));
      const outcomeOptions = paperRow
        ? await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code, statement: courseOutcomes.statement }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(and(eq(coSets.subjectId, paperRow.subjectId), eq(coSets.status, 'active'))).orderBy(asc(courseOutcomes.ord))
        : [];
      return { questions, outcomes, outcomeOptions, untagged: questions.filter((q) => !q.coId).length };
    });
  }

  /** Writes the paper's assessment-to-outcome shares from the question tags (marks of each tagged question), so attainment uses them. */
  @Post('exam-papers/:paperId/apply-outcome-map')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal', 'quality_officer', 'hod', 'exam_controller'])
  applyMap(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [paper] = await tx.select({ assessmentId: examPapers.assessmentId }).from(examPapers).where(eq(examPapers.id, paperId));
      if (!paper?.assessmentId) throw new ConflictException('This paper has no assessment to map');
      const [a] = await tx.select({ id: assessments.id }).from(assessments).where(eq(assessments.id, paper.assessmentId));
      const qs = await tx.select({ coId: evalQuestions.coId, maxMarks: evalQuestions.maxMarks }).from(evalQuestions).where(and(eq(evalQuestions.paperId, paperId), sql`${evalQuestions.coId} is not null`));
      const total = qs.reduce((s, q) => s + q.maxMarks, 0);
      if (!a || total <= 0) throw new ConflictException('Tag at least one question with a course outcome first');
      const share = new Map<string, number>();
      for (const q of qs) share.set(q.coId!, (share.get(q.coId!) ?? 0) + q.maxMarks / total);
      await tx.delete(assessmentCoMap).where(eq(assessmentCoMap.assessmentId, a.id));
      await tx.insert(assessmentCoMap).values([...share].map(([coId, s]) => ({ tenantId: p.tenantId, assessmentId: a.id, coId, share: Math.round(s * 1000) / 1000 })));
      await auditUser(tx, p, 'quality.outcome_map_applied', 'assessment', a.id, { outcomes: share.size });
      return { mapped: share.size };
    });
  }
}

