import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { zip } from '../analytics/zip.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { BlobBody, putBlob, type BlobInput } from '../common/blob.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { accreditationComments, accreditationEntries, accreditationSettings, accreditationTasks, dvvQueries, facultyEvidence, iqacActions, iqacFeedbackReports, iqacMeetings, iqacPractices } from '../db/schema-accreditation.js';
import { obeEvidence, users } from '../db/schema.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { AccreditationService } from './accreditation.service.js';
import { packIndexCsv, packIndexPdf, safeName, type PackItem } from './evidence-pack.js';
import { aisheDcf, dvvSheet, naacAqar, naacSsr, nbaSar, nirfDcs, summarySheets, udise, type ExportCtx } from './exports.js';
import { catalogueList, catalogueTree, metricsOf } from './frameworks/index.js';
import type { FrameworkDef } from './frameworks/types.js';
import { SourceCache } from './sources.js';
import { xlsx, type Sheet } from './xlsx.js';

const READ: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod', 'accreditation_reviewer'];
const MANAGE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const FACULTY: RoleName[] = ['teacher', 'hod', 'tenant_admin', 'principal', 'quality_officer'];
/** People who prepare metrics: the quality team, and teachers or heads a task names as owner (checked per metric). */
const PREPARERS: RoleName[] = ['teacher', 'hod', 'tenant_admin', 'principal', 'quality_officer', 'accreditation_reviewer'];
const MAX_FILE = 10 * 1024 * 1024;
/** The evidence pack stops adding files past this size (the index still lists every document). */
const PACK_LIMIT = 200 * 1024 * 1024;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CYCLE = z.string().regex(/^\d{4}(-\d{2,4})?$/);
const YEAR = z.string().regex(/^\d{4}-\d{2}$/);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Num = z.number().min(-1e12).max(1e12);

const EntryBody = z.object({
  cycle: CYCLE.optional(),
  /** The academic year the figures belong to; defaults to the cycle. */
  year: YEAR.optional(),
  value: Num.nullish(),
  inputs: z.record(z.string().max(40), Num.nullable()).optional(),
  textValue: z.string().max(8000).optional(),
  rows: z.array(z.array(z.string().max(500)).max(40)).max(2000).optional(),
  options: z.array(z.number().int().min(0).max(40)).max(40).nullish(),
  selfScore: z.number().min(0).max(1000).nullish(),
  note: z.string().max(2000).optional(),
});
const EvidenceBody = z.object({ cycle: CYCLE.optional(), year: YEAR.optional(), file: BlobBody.optional(), title: z.string().trim().min(2).max(200), url: z.url().optional(), note: z.string().trim().max(2000).optional() });
const ImportBody = z.object({ cycle: CYCLE.optional(), year: YEAR.optional(), file: BlobBody });
const DEVIATIONS = ['data_mismatch', 'documents_missing', 'formula', 'out_of_period', 'other'] as const;
const DvvBody = z.object({ framework: z.string().max(40).optional(), cycle: CYCLE, metricCode: z.string().trim().min(1).max(24), query: z.string().trim().min(3).max(2000), deviation: z.enum(DEVIATIONS).default('other'), heiValue: Num.nullish(), dvvValue: Num.nullish(), dueOn: DATE.nullish() });
const DvvPatch = z.object({ response: z.string().trim().max(4000).optional(), status: z.enum(['open', 'answered', 'accepted', 'rejected', 'closed']).optional(), dvvValue: Num.nullish(), heiValue: Num.nullish(), dueOn: DATE.nullish() });
const DvvDocBody = z.object({ title: z.string().trim().min(2).max(200), url: z.url().optional(), file: BlobBody.optional() });
const SettingsBody = z.object({ bench: z.record(z.string().max(24), z.number().positive().max(1e9)).optional(), weight: z.record(z.string().max(24), z.number().min(0).max(1000)).optional() });
const TASK_STATUS = ['assigned', 'in_progress', 'submitted', 'approved', 'returned'] as const;
const TaskBody = z.object({ cycle: CYCLE.optional(), scope: z.string().trim().min(1).max(24), departmentId: z.uuid().nullish(), ownerId: z.uuid().nullish(), reviewerId: z.uuid().nullish(), dueOn: DATE.nullish(), note: z.string().max(2000).default('') });
const TaskPatch = z.object({ status: z.enum(TASK_STATUS).optional(), departmentId: z.uuid().nullish(), ownerId: z.uuid().nullish(), reviewerId: z.uuid().nullish(), dueOn: DATE.nullish(), note: z.string().max(2000).optional() });
const CommentBody = z.object({ cycle: CYCLE.optional(), body: z.string().trim().min(1).max(4000) });
const MeetingBody = z.object({ title: z.string().trim().min(2).max(200), meetingOn: DATE, agenda: z.string().max(4000).default(''), minutes: z.string().max(12000).default(''), attendees: z.string().max(2000).default('') });
const ActionBody = z.object({ action: z.string().trim().min(2).max(1000), ownerName: z.string().trim().max(120).default(''), dueOn: DATE.nullish() });
const ActionPatch = z.object({ status: z.enum(['open', 'done']).optional(), actionTaken: z.string().max(4000).optional() });
const PracticeBody = z.object({ kind: z.enum(['best_practice', 'distinctiveness']), title: z.string().trim().min(2).max(200), year: z.string().max(20).default(''), objectives: z.string().max(4000).default(''), context: z.string().max(4000).default(''), practice: z.string().max(8000).default(''), evidence: z.string().max(4000).default(''), problems: z.string().max(4000).default('') });
const FeedbackBody = z.object({ cycle: CYCLE, stakeholder: z.enum(['students', 'teachers', 'employers', 'alumni', 'parents']), summary: z.string().trim().min(3).max(4000), averageRating: z.number().min(0).max(10).nullish(), responses: z.number().int().min(0).max(32000).nullish(), actionTaken: z.string().max(4000).default('') });
const FeedbackPatch = z.object({ actionTaken: z.string().max(4000).optional(), status: z.enum(['analysed', 'action_planned', 'action_taken']).optional(), summary: z.string().trim().min(3).max(4000).optional() });
const FacultyBody = z.object({ file: BlobBody.optional(), kind: z.enum(['publication', 'fdp', 'award', 'patent', 'book', 'other']), title: z.string().trim().min(2).max(300), year: z.number().int().min(1950).max(2100).nullish(), venue: z.string().trim().max(300).default(''), url: z.url().optional() });

const isManager = (p: UserPrincipal) => p.roles.some((r) => (MANAGE as string[]).includes(r) || r === 'accreditation_reviewer');

/**
 * Accreditation and statutory reporting (PRD sections 24 and 28): the framework catalogue (NAAC affiliated, autonomous and
 * university; NBA SAR Tier-II; NIRF college, university, engineering, management and pharmacy; AISHE DCF-II; UDISE+),
 * metrics computed year by year from ERP data with data-entry templates for the rest, evidence and DVV, official-layout
 * exports, the readiness dashboard with task assignment and reminders, the IQAC workspace and teacher-uploaded evidence.
 */
@Controller('v1/accreditation')
export class AccreditationController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly svc: AccreditationService,
    private readonly storage: ObjectStorage,
    private readonly scans: UploadScanService,
  ) {}

  /** The academic year in force today (for example 2026-27); used when a request names none. A five-year span keeps its last year. */
  private cycle(q?: string): string {
    if (q) {
      if (!CYCLE.safeParse(q).success) throw new BadRequestException('Cycle must look like 2026-27');
      const y = Number(q.slice(0, 4));
      const end = q.length > 7 ? Number(q.slice(5)) % 100 : null;
      const last = end !== null && q.length === 7 && end !== (y + 1) % 100 ? 2000 + end - 1 : y;
      return `${last}-${String((last + 1) % 100).padStart(2, '0')}`;
    }
    return this.svc.today();
  }

  private send(res: Response, name: string, type: string, buf: Buffer) {
    res.set({ 'content-type': type, 'content-length': String(buf.length), 'content-disposition': `attachment; filename="${name}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    res.end(buf);
  }

  // ---- catalogue -----------------------------------------------------------------------------------------------------

  /** Every framework seeded: NAAC, NBA, NIRF, AISHE and UDISE+ variants with their criteria and metric counts. */
  @Get('frameworks')
  @Auth('user', PREPARERS)
  frameworks() {
    return catalogueList();
  }

  /** One framework as a tree: criteria, key indicators and metrics with type, formula, inputs, template columns, evidence and weightage (with the institution's overrides). */
  @Get('frameworks/:fw')
  @Auth('user', PREPARERS)
  frameworkTree(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string) {
    const f = this.svc.framework(fw);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(accreditationSettings).where(eq(accreditationSettings.framework, f.key));
      return catalogueTree(f, { weight: s?.weight, bench: s?.bench });
    });
  }

  @Get(':fw/settings')
  @Auth('user', READ)
  settings(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string) {
    const f = this.svc.framework(fw);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(accreditationSettings).where(eq(accreditationSettings.framework, f.key));
      return { framework: f.key, bench: s?.bench ?? {}, weight: s?.weight ?? {} };
    });
  }

  /** Benchmark and weightage overrides (for example the NIRF category leaders' values); a metric left out returns to the catalogue value. */
  @Put(':fw/settings')
  @Auth('user', ADMIN)
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Body(new ZodBody(SettingsBody)) v: z.infer<typeof SettingsBody>) {
    const f = this.svc.framework(fw);
    const codes = new Set(metricsOf(f).map((m) => m.code));
    for (const k of [...Object.keys(v.bench ?? {}), ...Object.keys(v.weight ?? {})]) if (!codes.has(k)) throw new BadRequestException(`Metric ${k} is not in ${f.title}`);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const vals = { bench: v.bench ?? {}, weight: v.weight ?? {}, updatedBy: p.userId, updatedAt: new Date() };
      const [r] = await tx.insert(accreditationSettings).values({ tenantId: p.tenantId, framework: f.key, ...vals }).onConflictDoUpdate({ target: [accreditationSettings.tenantId, accreditationSettings.framework], set: vals }).returning();
      await auditUser(tx, p, 'accreditation.settings_saved', 'accreditation_settings', r.id, { framework: f.key });
      return { framework: f.key, bench: r.bench, weight: r.weight };
    });
  }

  // ---- metrics -------------------------------------------------------------------------------------------------------

  /** Every metric of a framework for the submission ending with the cycle: year-wise values, score, completeness and the estimate. */
  @Get(':fw/overview')
  @Auth('user', READ)
  overview(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.assess(tx, f, c));
  }

  /** The executive readiness view: estimate per criterion, gaps, owners, due dates, tasks and DVV status. */
  @Get(':fw/readiness')
  @Auth('user', READ)
  readiness(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.readiness(tx, f, c));
  }

  /** One metric: formula, inputs by year with the ERP records behind them, data template rows, evidence, comments, assignment and DVV. */
  @Get(':fw/metrics/:code')
  @Auth('user', PREPARERS)
  metric(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!isManager(p)) await this.svc.assertCanEdit(tx, p, f, c, m);
      return this.svc.detail(tx, f, code, c);
    });
  }

  /**
   * Saves what the institution enters for a metric in one academic year: a figure overriding the computed one, formula
   * inputs (null clears one), data template rows, options ticked, the narrative, its own marking and a note. Fields left
   * out stay as they were.
   */
  @Put(':fw/metrics/:code')
  @Auth('user', PREPARERS)
  save(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Body(new ZodBody(EntryBody)) v: z.infer<typeof EntryBody>, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(v.cycle ?? cycle);
    const year = v.year ?? c;
    if (!this.svc.yearsOf(f, m, c).includes(year)) throw new BadRequestException(`Metric ${code} covers ${this.svc.yearsOf(f, m, c).join(', ')}`);
    if (v.inputs) for (const k of Object.keys(v.inputs)) if (!m.inputs.some((i) => i.key === k)) throw new BadRequestException(`Metric ${code} has no input ${k}`);
    if (v.options && (!m.options || v.options.some((i) => i >= m.options!.length))) throw new BadRequestException('Tick options of this metric only');
    if (v.rows && m.columns.length && v.rows.some((r) => r.length > m.columns.length + 1)) throw new BadRequestException(`Rows have at most ${m.columns.length} columns`);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.assertCanEdit(tx, p, f, c, m);
      const row = await this.svc.ensureEntry(tx, p, f, year, code);
      const patch: Partial<typeof accreditationEntries.$inferInsert> = { updatedBy: p.userId, updatedAt: new Date() };
      if (v.value !== undefined) patch.value = v.value;
      if (v.inputs !== undefined) {
        const next = { ...((row.inputs as Record<string, number>) ?? {}) };
        for (const [k, x] of Object.entries(v.inputs)) if (x === null) delete next[k]; else next[k] = x;
        patch.inputs = next;
      }
      if (v.textValue !== undefined) patch.textValue = v.textValue;
      if (v.rows !== undefined) patch.dataRows = v.rows;
      if (v.options !== undefined) patch.options = v.options ? [...new Set(v.options)].sort((a, b) => a - b) : null;
      if (v.selfScore !== undefined) patch.selfScore = v.selfScore;
      if (v.note !== undefined) patch.note = v.note;
      const [r] = await tx.update(accreditationEntries).set(patch).where(eq(accreditationEntries.id, row.id)).returning();
      await auditUser(tx, p, 'accreditation.metric_saved', 'accreditation_entry', row.id, { framework: f.key, year, code });
      return r;
    });
  }

  @Get(':fw/metrics/:code/evidence')
  @Auth('user', PREPARERS)
  evidence(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!isManager(p)) await this.svc.assertCanEdit(tx, p, f, c, m);
      const es = await tx.select({ id: accreditationEntries.id, year: accreditationEntries.cycle }).from(accreditationEntries).where(and(eq(accreditationEntries.body, f.key), eq(accreditationEntries.metricCode, code), inArray(accreditationEntries.cycle, this.svc.yearsOf(f, m, c))));
      if (!es.length) return [];
      const yearOf = new Map(es.map((e) => [e.id, e.year]));
      const rows = await tx.select({ id: obeEvidence.id, targetId: obeEvidence.targetId, title: obeEvidence.title, url: obeEvidence.url, note: obeEvidence.note, fileName: obeEvidence.fileName, createdAt: obeEvidence.createdAt }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'metric'), inArray(obeEvidence.targetId, es.map((e) => e.id)))).orderBy(asc(obeEvidence.createdAt));
      return rows.map(({ targetId, ...r }) => ({ ...r, year: yearOf.get(targetId) ?? null }));
    });
  }

  /** Adds a link, a note or a file as evidence for a metric in one academic year; a PDF or image can also be attached with `POST evidence/:id/file`. */
  @Post(':fw/metrics/:code/evidence')
  @Auth('user', PREPARERS)
  async addEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Body(new ZodBody(EvidenceBody)) v: z.infer<typeof EvidenceBody>, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(v.cycle ?? cycle);
    const year = v.year ?? c;
    if (!this.svc.yearsOf(f, m, c).includes(year)) throw new BadRequestException(`Metric ${code} covers ${this.svc.yearsOf(f, m, c).join(', ')}`);
    await this.db.withTenant(p.tenantId, (tx) => this.svc.assertCanEdit(tx, p, f, c, m));
    const blob = await this.storeBlob(p, v.file);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.svc.ensureEntry(tx, p, f, year, code);
      const [row] = await tx.insert(obeEvidence).values({ tenantId: p.tenantId, programId: null, scope: 'metric', targetId: e.id, title: v.title, url: v.url ?? null, note: v.note ?? null, uploadedBy: p.userId, ...blob }).returning();
      await auditUser(tx, p, 'accreditation.evidence_added', 'obe_evidence', row.id, { framework: f.key, year, code });
      return { ...row, year };
    });
  }

  /** Attaches a PDF, JPEG or PNG to a metric's evidence line (multipart field `file`). */
  @Post('evidence/:id/file')
  @Auth('user', ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE, files: 1 } }))
  async evidenceFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    const { key, name } = await this.store(p, file, `accreditation/evidence/${id}`);
    try {
      return await this.db.withTenant(p.tenantId, async (tx) => {
        const [e] = await tx.select({ id: obeEvidence.id, scope: obeEvidence.scope }).from(obeEvidence).where(eq(obeEvidence.id, id));
        if (!e || (e.scope !== 'metric' && e.scope !== 'dvv')) throw new NotFoundException('Evidence not found');
        const [r] = await tx.update(obeEvidence).set({ fileKey: key, fileName: name }).where(eq(obeEvidence.id, id)).returning();
        await auditUser(tx, p, 'accreditation.evidence_file_uploaded', 'obe_evidence', id);
        return r;
      });
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  /** Downloads the file attached to an evidence line. */
  @Get('evidence/:id/download')
  @Auth('user', READ)
  async evidenceDownload(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const e = await this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select({ fileKey: obeEvidence.fileKey, fileName: obeEvidence.fileName, scope: obeEvidence.scope }).from(obeEvidence).where(eq(obeEvidence.id, id));
      return r;
    });
    if (!e || !e.fileKey || (e.scope !== 'metric' && e.scope !== 'dvv')) throw new NotFoundException('No file on this evidence');
    const buf = await this.read(e.fileKey);
    this.send(res, safeName(e.fileName ?? 'evidence'), documentType(buf) ?? 'application/octet-stream', buf);
  }

  @Delete('evidence/:id')
  @Auth('user', ADMIN)
  removeEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(obeEvidence).where(and(eq(obeEvidence.id, id), inArray(obeEvidence.scope, ['metric', 'dvv']))).returning({ id: obeEvidence.id, fileKey: obeEvidence.fileKey });
      if (!gone.length) throw new NotFoundException('Evidence not found');
      await auditUser(tx, p, 'accreditation.evidence_removed', 'obe_evidence', id);
      if (gone[0].fileKey) await this.storage.delete(gone[0].fileKey).catch(() => undefined);
      return { removed: 1 };
    });
  }

  /** The data-entry template of a metric: official columns with the rows so far, year-wise inputs, options and the evidence list. */
  @Get(':fw/metrics/:code/template.xlsx')
  @Auth('user', PREPARERS)
  async template(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Res() res: Response, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(cycle);
    const buf = await this.db.withTenant(p.tenantId, (tx) => this.svc.template(tx, f, m, c));
    this.send(res, `${f.key}-${code}-template.xlsx`, XLSX_TYPE, buf);
  }

  /** Bulk import of a filled template (.xlsx, sent as a file in the JSON body): data rows by academic year, year-wise inputs and options. */
  @Post(':fw/metrics/:code/import')
  @Auth('user', PREPARERS)
  importTemplate(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Body(new ZodBody(ImportBody)) v: z.infer<typeof ImportBody>) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(v.cycle);
    const buf = Buffer.from(v.file.contentBase64, 'base64');
    if (buf.length > MAX_FILE) throw new BadRequestException('The workbook is larger than 10 MB');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.assertCanEdit(tx, p, f, c, m);
      const r = await this.svc.importTemplate(tx, p, f, m, c, v.year ?? c, buf);
      await auditUser(tx, p, 'accreditation.template_imported', 'accreditation_entry', undefined, { framework: f.key, code, years: Object.keys(r.stored) });
      return r;
    });
  }

  @Get(':fw/metrics/:code/comments')
  @Auth('user', PREPARERS)
  comments(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!isManager(p)) await this.svc.assertCanEdit(tx, p, f, c, m);
      return tx.select({ id: accreditationComments.id, body: accreditationComments.body, createdAt: accreditationComments.createdAt, userId: accreditationComments.userId, author: users.fullName }).from(accreditationComments).leftJoin(users, eq(users.id, accreditationComments.userId)).where(and(eq(accreditationComments.framework, f.key), eq(accreditationComments.cycle, c), eq(accreditationComments.metricCode, code))).orderBy(asc(accreditationComments.createdAt));
    });
  }

  /** A comment on a metric; the task owner and reviewer are told. */
  @Post(':fw/metrics/:code/comments')
  @Auth('user', PREPARERS)
  comment(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Param('code') code: string, @Body(new ZodBody(CommentBody)) v: z.infer<typeof CommentBody>) {
    const f = this.svc.framework(fw);
    const m = this.svc.metric(f, code);
    const c = this.cycle(v.cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!isManager(p)) await this.svc.assertCanEdit(tx, p, f, c, m);
      const [r] = await tx.insert(accreditationComments).values({ tenantId: p.tenantId, framework: f.key, cycle: c, metricCode: code, userId: p.userId, body: v.body }).returning();
      await auditUser(tx, p, 'accreditation.comment_added', 'accreditation_comment', r.id, { framework: f.key, code });
      return r;
    });
  }

  // ---- tasks and reminders --------------------------------------------------------------------------------------------

  @Get(':fw/tasks')
  @Auth('user', READ)
  tasks(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.tasks(tx, f, c));
  }

  /** Assigns a metric or a whole criterion to a department and / or a member of staff with a due date (one task per scope and cycle; assigning again updates it). */
  @Post(':fw/tasks')
  @Auth('user', MANAGE)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Body(new ZodBody(TaskBody)) v: z.infer<typeof TaskBody>) {
    const f = this.svc.framework(fw);
    const c = this.cycle(v.cycle);
    if (!v.ownerId && !v.departmentId) throw new BadRequestException('Assign to a department or a member of staff');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.assertTask(tx, f, v.scope, v.ownerId, v.reviewerId, v.departmentId);
      const vals = { departmentId: v.departmentId ?? null, ownerId: v.ownerId ?? null, reviewerId: v.reviewerId ?? null, dueOn: v.dueOn ?? null, note: v.note, updatedAt: new Date() };
      const [r] = await tx.insert(accreditationTasks).values({ tenantId: p.tenantId, framework: f.key, cycle: c, scope: v.scope, createdBy: p.userId, ...vals }).onConflictDoUpdate({ target: [accreditationTasks.tenantId, accreditationTasks.framework, accreditationTasks.cycle, accreditationTasks.scope], set: { ...vals, status: 'assigned', lastRemindedOn: null } }).returning();
      if (r.ownerId && r.ownerId !== p.userId) await this.svc.notifyAssigned(tx, f, r);
      await auditUser(tx, p, 'accreditation.task_assigned', 'accreditation_task', r.id, { framework: f.key, scope: v.scope });
      return r;
    });
  }

  /**
   * Moves a task through review. The owner starts and submits it; the quality team (or the named reviewer) approves or
   * returns it and can reassign it.
   */
  @Put('tasks/:id')
  @Auth('user', PREPARERS)
  updateTask(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TaskPatch)) v: z.infer<typeof TaskPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select().from(accreditationTasks).where(eq(accreditationTasks.id, id));
      if (!t) throw new NotFoundException('Task not found');
      const admin = p.roles.some((r) => (ADMIN as string[]).includes(r));
      const reviewer = admin || t.reviewerId === p.userId;
      const owner = t.ownerId === p.userId;
      const reassign = v.ownerId !== undefined || v.reviewerId !== undefined || v.departmentId !== undefined || v.dueOn !== undefined;
      if (reassign && !admin) throw new BadRequestException('Only the quality team reassigns tasks');
      if (v.status === 'approved' || v.status === 'returned') {
        if (!reviewer) throw new BadRequestException('Only the reviewer or the quality team approves or returns a task');
      } else if (v.status && !owner && !admin) throw new BadRequestException('Only the owner updates this task');
      if (!reviewer && !owner) throw new NotFoundException('Task not found');
      const f = this.svc.framework(t.framework);
      if (reassign) await this.svc.assertTask(tx, f, t.scope, v.ownerId, v.reviewerId, v.departmentId);
      const [r] = await tx.update(accreditationTasks).set({ ...v, updatedAt: new Date() }).where(eq(accreditationTasks.id, id)).returning();
      if (v.status === 'submitted' && (r.reviewerId ?? null) && r.reviewerId !== p.userId) await this.svc.notifyStatus(tx, f, r, [r.reviewerId!]);
      if ((v.status === 'approved' || v.status === 'returned') && r.ownerId && r.ownerId !== p.userId) await this.svc.notifyStatus(tx, f, r, [r.ownerId]);
      if (v.ownerId && v.ownerId !== t.ownerId && v.ownerId !== p.userId) await this.svc.notifyAssigned(tx, f, r);
      await auditUser(tx, p, 'accreditation.task_updated', 'accreditation_task', id, { status: r.status });
      return r;
    });
  }

  @Delete('tasks/:id')
  @Auth('user', MANAGE)
  removeTask(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(accreditationTasks).where(eq(accreditationTasks.id, id)).returning({ id: accreditationTasks.id });
      if (!gone.length) throw new NotFoundException('Task not found');
      await auditUser(tx, p, 'accreditation.task_removed', 'accreditation_task', id);
      return { removed: 1 };
    });
  }

  /** Sends reminders now for tasks of the framework due within three days or overdue (the daily job does this for every framework). */
  @Post(':fw/tasks/remind')
  @Auth('user', MANAGE)
  remind(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sent = await this.svc.remind(tx, { framework: f.key, cycle: c });
      await auditUser(tx, p, 'accreditation.reminders_sent', 'accreditation_task', undefined, { framework: f.key, sent });
      return { sent };
    });
  }

  /** Staff who can own or review accreditation work, and the departments, for the assignment pickers. */
  @Get('people')
  @Auth('user', MANAGE)
  people(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      staff: (await tx.execute(sql`select u.id, u.full_name as name, string_agg(distinct ur.role::text, ', ' order by ur.role::text) as roles, coalesce(d.name, '') as department
        from users u join user_roles ur on ur.user_id = u.id left join staff_profiles sp on sp.user_id = u.id left join departments d on d.id = sp.department_id
        where ur.role in ('teacher', 'hod', 'principal', 'quality_officer', 'tenant_admin', 'accreditation_reviewer', 'research_coordinator', 'placement_officer', 'librarian', 'exam_controller', 'accountant', 'counsellor')
          and u.status = 'active' group by u.id, u.full_name, d.name order by u.full_name`)).rows as { id: string; name: string; roles: string; department: string }[],
      departments: (await tx.execute(sql`select id, name from departments order by name`)).rows as { id: string; name: string }[],
    }));
  }

  /** Accreditation tasks assigned to me, across frameworks and cycles. */
  @Get('my-tasks')
  @Auth('user', PREPARERS)
  myTasks(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(accreditationTasks).where(eq(accreditationTasks.ownerId, p.userId)).orderBy(asc(accreditationTasks.dueOn));
      return rows.map((r) => {
        const f = this.svc.framework(r.framework);
        const m = metricsOf(f).find((x) => x.code === r.scope);
        const crit = m ? null : f.criteria.find((c) => c.id === r.scope);
        return { ...r, frameworkTitle: f.title, title: m ? m.title : `Criterion ${r.scope}: ${crit?.title ?? ''}`, kind: m ? 'metric' : 'criterion', metrics: crit ? metricsOf(f).filter((x) => x.criterion === crit.id).map((x) => ({ code: x.code, title: x.title })) : [] };
      });
    });
  }

  // ---- DVV clarifications ----------------------------------------------------------------------------------------------

  @Get('dvv')
  @Auth('user', READ)
  dvvList(@CurrentPrincipal() p: UserPrincipal, @Query('cycle') cycle?: string, @Query('framework') fw?: string) {
    const c = this.cycle(cycle);
    const f = fw ? this.svc.framework(fw).key : null;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await this.svc.dvvList(tx, f, c);
      const docs = rows.length ? await tx.select({ targetId: obeEvidence.targetId, n: sql<number>`count(*)::int` }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'dvv'), inArray(obeEvidence.targetId, rows.map((r) => r.id)))).groupBy(obeEvidence.targetId) : [];
      const n = new Map(docs.map((d) => [d.targetId, Number(d.n)]));
      return rows.map((r) => ({ ...r, documents: n.get(r.id) ?? 0 }));
    });
  }

  /** Records a clarification raised by the DVV partner against a metric, with the deviation and the values on both sides. */
  @Post('dvv')
  @Auth('user', [...ADMIN, 'accreditation_reviewer'])
  dvvAdd(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DvvBody)) v: z.infer<typeof DvvBody>) {
    const f = this.svc.framework(v.framework ?? 'naac');
    this.svc.metric(f, v.metricCode);
    const c = this.cycle(v.cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.insert(dvvQueries).values({ tenantId: p.tenantId, framework: f.key, cycle: c, metricCode: v.metricCode, query: v.query, deviation: v.deviation, heiValue: v.heiValue ?? null, dvvValue: v.dvvValue ?? null, dueOn: v.dueOn ?? null, raisedBy: p.userId }).returning();
      await auditUser(tx, p, 'accreditation.dvv_raised', 'dvv_query', r.id, { framework: f.key, metric: v.metricCode });
      return r;
    });
  }

  /** The institution's response (which marks it answered), DVV's decision (accepted, rejected with the value DVV keeps) or closing it. */
  @Put('dvv/:id')
  @Auth('user', [...ADMIN, 'accreditation_reviewer'])
  dvvUpdate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DvvPatch)) v: z.infer<typeof DvvPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const status = v.status ?? (v.response ? 'answered' : undefined);
      const [r] = await tx
        .update(dvvQueries)
        .set({
          ...(v.response !== undefined ? { response: v.response, respondedBy: p.userId } : {}),
          ...(status ? { status } : {}),
          ...(v.response ? { answeredAt: new Date() } : {}),
          ...(status === 'closed' || status === 'accepted' ? { closedAt: new Date() } : {}),
          ...(v.dvvValue !== undefined ? { dvvValue: v.dvvValue } : {}),
          ...(v.heiValue !== undefined ? { heiValue: v.heiValue } : {}),
          ...(v.dueOn !== undefined ? { dueOn: v.dueOn } : {}),
        })
        .where(eq(dvvQueries.id, id))
        .returning();
      if (!r) throw new NotFoundException('Clarification not found');
      await auditUser(tx, p, 'accreditation.dvv_updated', 'dvv_query', id, { status: r.status });
      return r;
    });
  }

  @Get('dvv/:id/documents')
  @Auth('user', READ)
  dvvDocs(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: obeEvidence.id, title: obeEvidence.title, url: obeEvidence.url, fileName: obeEvidence.fileName, createdAt: obeEvidence.createdAt }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'dvv'), eq(obeEvidence.targetId, id))).orderBy(asc(obeEvidence.createdAt)));
  }

  /** Attaches a document (file or link) to a DVV response. */
  @Post('dvv/:id/documents')
  @Auth('user', ADMIN)
  async dvvDoc(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DvvDocBody)) v: z.infer<typeof DvvDocBody>) {
    if (!v.file && !v.url) throw new BadRequestException('Attach a file or give a link');
    const exists = await this.db.withTenant(p.tenantId, async (tx) => (await tx.select({ id: dvvQueries.id }).from(dvvQueries).where(eq(dvvQueries.id, id))).length > 0);
    if (!exists) throw new NotFoundException('Clarification not found');
    const blob = await this.storeBlob(p, v.file);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(obeEvidence).values({ tenantId: p.tenantId, programId: null, scope: 'dvv', targetId: id, title: v.title, url: v.url ?? null, uploadedBy: p.userId, ...blob }).returning();
      await auditUser(tx, p, 'accreditation.dvv_document_added', 'obe_evidence', row.id, { dvv: id });
      return row;
    });
  }

  /** The DVV clarification register of a framework and cycle as a workbook. */
  @Get(':fw/dvv.xlsx')
  @Auth('user', READ)
  async dvvExport(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Res() res: Response, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const c = this.cycle(cycle);
    const rows = await this.db.withTenant(p.tenantId, (tx) => this.svc.dvvList(tx, f.key, c));
    this.send(res, `${f.key}-dvv-${c}.xlsx`, XLSX_TYPE, xlsx([dvvSheet(rows, c)], this.clock.now()));
  }

  // ---- exports -------------------------------------------------------------------------------------------------------

  private async exportCtx(tx: Tx, f: FrameworkDef, cycle: string): Promise<ExportCtx> {
    const cache = new SourceCache(tx);
    const a = await this.svc.assess(tx, f, cycle, undefined, cache);
    const entries = await tx.select({ code: accreditationEntries.metricCode, year: accreditationEntries.cycle, rows: accreditationEntries.dataRows }).from(accreditationEntries).where(and(eq(accreditationEntries.body, f.key), inArray(accreditationEntries.cycle, a.window)));
    const rows = new Map<string, Map<string, string[][]>>();
    for (const e of entries) if ((e.rows as string[][]).length) rows.set(e.code, (rows.get(e.code) ?? new Map()).set(e.year, e.rows as string[][]));
    return { f, a, inst: await this.svc.institution(tx), at: this.clock.now(), rows, cache, today: this.svc.today() };
  }

  private rowsSourceOf(f: FrameworkDef) {
    const ms = metricsOf(f);
    return (code: string) => ms.find((m) => m.code === code)?.rowsSource;
  }

  private async profile(tx: Tx): Promise<Record<string, string | number | null>> {
    const r = (await tx.execute(sql`select coalesce(p.legal_name, t.name) as "Name of the institution", p.aishe_code as "AISHE / UDISE code", p.institution_type as "Type", p.governance_model as "Management", p.affiliation_body as "Affiliating university or board", p.affiliation_no as "Affiliation number", p.established_year as "Year of establishment", concat_ws(', ', nullif(p.address_line, ''), nullif(p.city, ''), nullif(p.state, ''), nullif(p.pincode, '')) as "Address", p.phone as "Phone", p.email as "Email", p.website as "Website", p.naac_grade as "NAAC grade"
      from tenants t left join institution_profiles p on p.tenant_id = t.id limit 1`)).rows[0] as Record<string, string | number | null> | undefined;
    return r ?? {};
  }

  /** NAAC self-study report data: extended profile, a workbook per metric in criterion folders, summary, DVV register and README. */
  @Get(':fw/export.zip')
  @Auth('user', ADMIN)
  async ssr(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Res() res: Response, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    if (f.body !== 'naac') throw new BadRequestException('The SSR pack is for NAAC frameworks; use export.xlsx');
    const c = this.cycle(cycle);
    const files = await this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.exportCtx(tx, f, c);
      const out = await naacSsr(ctx, await this.svc.dvvList(tx, f.key, c), this.rowsSourceOf(f));
      await auditUser(tx, p, 'accreditation.ssr_exported', 'accreditation', undefined, { framework: f.key, cycle: c });
      return out;
    });
    this.send(res, `${f.key}-ssr-${c}.zip`, 'application/zip', zip(files, this.clock.now()));
  }

  /** NAAC Annual Quality Assurance Report for the year: Part A, the criteria and the year's data templates. */
  @Get(':fw/aqar.xlsx')
  @Auth('user', ADMIN)
  async aqar(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Res() res: Response, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    if (f.body !== 'naac') throw new BadRequestException('The AQAR is a NAAC report');
    const c = this.cycle(cycle);
    const one: FrameworkDef = { ...f, years: 1 };
    const buf = await this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.exportCtx(tx, one, c);
      const y = Number(c.slice(0, 4));
      const iq = (await tx.execute(sql`select (select count(*)::int from iqac_meetings where meeting_on between ${`${y}-06-01`}::date and ${`${y + 1}-05-31`}::date) as meetings, (select count(*)::int from iqac_actions a join iqac_meetings m on m.id = a.meeting_id where m.meeting_on between ${`${y}-06-01`}::date and ${`${y + 1}-05-31`}::date) as actions, (select count(*)::int from iqac_practices) as practices`)).rows[0] as { meetings: number; actions: number; practices: number };
      await auditUser(tx, p, 'accreditation.aqar_exported', 'accreditation', undefined, { framework: f.key, cycle: c });
      return naacAqar(ctx, iq, this.rowsSourceOf(f));
    });
    this.send(res, `${f.key}-aqar-${c}.xlsx`, XLSX_TYPE, buf);
  }

  /** The framework's main workbook: NBA SAR tables, NIRF data capture sheets with the score estimate, AISHE DCF-II, UDISE+, or the NAAC summary. */
  @Get(':fw/export.xlsx')
  @Auth('user', READ)
  async exportXlsx(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Res() res: Response, @Query('cycle') cycle?: string, @Query('tier') tier?: string) {
    const f = this.svc.framework(fw);
    if (f.body === 'nba' && tier !== undefined && tier !== '2') throw new BadRequestException('The SAR catalogue is for Tier-II UG engineering programmes');
    const c = this.cycle(cycle);
    const buf = await this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.exportCtx(tx, f, c);
      await auditUser(tx, p, `accreditation.${f.body}_exported`, 'accreditation', undefined, { framework: f.key, cycle: c });
      if (f.body === 'nba') return nbaSar(ctx, await this.svc.attainmentRows(tx), await this.svc.coPoMatrix(tx));
      if (f.body === 'nirf') return nirfDcs(ctx);
      if (f.body === 'aishe') return aisheDcf(ctx, await this.profile(tx));
      if (f.body === 'udise') return udise(ctx, await this.profile(tx));
      return xlsx(summarySheets(ctx, f.title), ctx.at);
    });
    this.send(res, `${f.key}-${c}.xlsx`, XLSX_TYPE, buf);
  }

  /** Every evidence file of the framework's period in a folder per criterion and metric, with an index PDF and CSV. */
  @Get(':fw/evidence-pack.zip')
  @Auth('user', ADMIN)
  async evidencePack(@CurrentPrincipal() p: UserPrincipal, @Param('fw') fw: string, @Res() res: Response, @Query('cycle') cycle?: string) {
    const f = this.svc.framework(fw);
    const c = this.cycle(cycle);
    const ms = metricsOf(f);
    const { list, inst, completeness, window } = await this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.svc.assess(tx, f, c);
      const rows = (await tx.execute(sql`select e.metric_code, e.cycle as year, v.id, v.title, v.url, v.note, v.file_key, v.file_name from obe_evidence v join accreditation_entries e on e.id = v.target_id
        where v.scope = 'metric' and e.body = ${f.key} and e.cycle in (${sql.join(a.window.map((y) => sql`${y}`), sql`, `)}) order by e.metric_code, e.cycle, v.created_at`)).rows as { metric_code: string; year: string; id: string; title: string; url: string | null; note: string | null; file_key: string | null; file_name: string | null }[];
      await auditUser(tx, p, 'accreditation.evidence_pack_exported', 'accreditation', undefined, { framework: f.key, cycle: c, documents: rows.length });
      return { list: rows, inst: await this.svc.institution(tx), completeness: `${a.completeness.percent}% (${a.completeness.complete} of ${a.completeness.total} metrics complete)`, window: a.window };
    });
    const files: { name: string; data: Buffer }[] = [];
    const items: PackItem[] = [];
    let size = 0;
    let skipped = 0;
    const used = new Set<string>();
    for (const r of list) {
      const m = ms.find((x) => x.code === r.metric_code);
      const crit = f.criteria.find((x) => x.id === m?.criterion);
      let path: string | null = null;
      if (r.file_key) {
        const data = await this.read(r.file_key).catch(() => null);
        if (data && size + data.length <= PACK_LIMIT) {
          let name = `${crit?.id === 'EP' ? 'Extended profile' : `Criterion ${crit?.id ?? '-'}`}/${r.metric_code}/${r.year}/${safeName(r.file_name ?? r.title)}`;
          for (let i = 2; used.has(name.toLowerCase()); i++) name = name.replace(/(\.[^./]+)?$/, `-${i}$1`);
          used.add(name.toLowerCase());
          files.push({ name, data });
          size += data.length;
          path = name;
        } else skipped++;
      }
      items.push({ criterion: crit?.id ?? '-', criterionTitle: crit?.title ?? '', metric: r.metric_code, metricTitle: m?.title ?? '', year: r.year, title: r.title, url: r.url, note: r.note, fileName: r.file_name, path });
    }
    const at = this.clock.now();
    files.unshift({ name: '00 Evidence index.pdf', data: packIndexPdf({ inst, framework: f.title, cycle: window.length > 1 ? `${window[0]} to ${window[window.length - 1]}` : c, generatedOn: at.toISOString().slice(0, 10), completeness, items, skipped }) }, { name: '00 Evidence index.csv', data: packIndexCsv(items) });
    this.send(res, `${f.key}-evidence-${c}.zip`, 'application/zip', zip(files, at));
  }

  // ---- files ---------------------------------------------------------------------------------------------------------

  private async read(key: string): Promise<Buffer> {
    const o = await this.storage.get(key);
    const chunks: Buffer[] = [];
    for await (const ch of o.stream) chunks.push(Buffer.from(ch as Buffer));
    return Buffer.concat(chunks);
  }

  /** Scans and stores a file sent inside a JSON body; returns what the table keeps. */
  private async storeBlob(p: UserPrincipal, f: BlobInput | undefined) {
    if (!f) return { fileKey: null, fileName: null };
    await this.scans.assertClean(Buffer.from(f.contentBase64, 'base64'), 'The evidence file');
    const b = await putBlob(this.storage, p.tenantId, 'accreditation', f);
    return { fileKey: b.storageKey, fileName: f.filename.slice(0, 200) };
  }

  private async store(p: UserPrincipal, file: { buffer: Buffer; originalname: string } | undefined, prefix: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The file must be a PDF, JPEG or PNG');
    await this.scans.assertClean(file.buffer, 'The evidence file');
    const key = `tenants/${p.tenantId}/${prefix}-${Date.now()}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_FILE, type);
    return { key, name: file.originalname.slice(0, 200) };
  }

  // ---- IQAC workspace ----------------------------------------------------------------------------------------

  @Get('iqac/meetings')
  @Auth('user', MANAGE)
  meetings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ms = await tx.select().from(iqacMeetings).orderBy(desc(iqacMeetings.meetingOn));
      const acts = await tx.select().from(iqacActions).orderBy(asc(iqacActions.createdAt));
      return ms.map((m) => ({ ...m, actions: acts.filter((a) => a.meetingId === m.id) }));
    });
  }

  @Post('iqac/meetings')
  @Auth('user', ADMIN)
  addMeeting(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MeetingBody)) v: z.infer<typeof MeetingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.insert(iqacMeetings).values({ tenantId: p.tenantId, ...v, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'iqac.meeting_added', 'iqac_meeting', r.id);
      return r;
    });
  }

  @Put('iqac/meetings/:id')
  @Auth('user', ADMIN)
  editMeeting(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MeetingBody.partial())) v: Partial<z.infer<typeof MeetingBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.update(iqacMeetings).set(v).where(eq(iqacMeetings.id, id)).returning();
      if (!r) throw new NotFoundException('Meeting not found');
      await auditUser(tx, p, 'iqac.meeting_updated', 'iqac_meeting', id);
      return r;
    });
  }

  @Post('iqac/meetings/:id/actions')
  @Auth('user', ADMIN)
  addAction(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActionBody)) v: z.infer<typeof ActionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.select({ id: iqacMeetings.id }).from(iqacMeetings).where(eq(iqacMeetings.id, id));
      if (!m) throw new NotFoundException('Meeting not found');
      const [r] = await tx.insert(iqacActions).values({ tenantId: p.tenantId, meetingId: id, action: v.action, ownerName: v.ownerName, dueOn: v.dueOn ?? null }).returning();
      await auditUser(tx, p, 'iqac.action_added', 'iqac_action', r.id);
      return r;
    });
  }

  /** Records the action taken; marking an action done closes it. */
  @Put('iqac/actions/:id')
  @Auth('user', ADMIN)
  updateAction(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActionPatch)) v: z.infer<typeof ActionPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.update(iqacActions).set({ ...v, ...(v.status === 'done' ? { closedAt: new Date() } : v.status === 'open' ? { closedAt: null } : {}) }).where(eq(iqacActions.id, id)).returning();
      if (!r) throw new NotFoundException('Action not found');
      await auditUser(tx, p, 'iqac.action_updated', 'iqac_action', id, { status: r.status });
      return r;
    });
  }

  @Get('iqac/practices')
  @Auth('user', MANAGE)
  practices(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(iqacPractices).orderBy(asc(iqacPractices.kind), asc(iqacPractices.createdAt)));
  }

  @Post('iqac/practices')
  @Auth('user', ADMIN)
  addPractice(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PracticeBody)) v: z.infer<typeof PracticeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.insert(iqacPractices).values({ tenantId: p.tenantId, ...v, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'iqac.practice_added', 'iqac_practice', r.id);
      return r;
    });
  }

  @Put('iqac/practices/:id')
  @Auth('user', ADMIN)
  editPractice(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PracticeBody.partial())) v: Partial<z.infer<typeof PracticeBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.update(iqacPractices).set(v).where(eq(iqacPractices.id, id)).returning();
      if (!r) throw new NotFoundException('Practice not found');
      await auditUser(tx, p, 'iqac.practice_updated', 'iqac_practice', id);
      return r;
    });
  }

  @Delete('iqac/practices/:id')
  @Auth('user', ADMIN)
  removePractice(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(iqacPractices).where(eq(iqacPractices.id, id)).returning({ id: iqacPractices.id });
      if (!gone.length) throw new NotFoundException('Practice not found');
      await auditUser(tx, p, 'iqac.practice_deleted', 'iqac_practice', id);
      return { removed: 1 };
    });
  }

  /** Feedback gathered through surveys: responses and average rating per survey and audience, ready to turn into an action taken report. */
  @Get('iqac/feedback-analysis')
  @Auth('user', MANAGE)
  feedbackAnalysis(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await tx.execute(sql`select s.id, s.title, s.audience::text as audience, s.status::text as status, count(distinct r.id)::int as responses, round(avg(a.rating)::numeric, 2)::float8 as average
        from surveys s left join survey_responses r on r.survey_id = s.id left join survey_answers a on a.response_id = r.id and a.rating is not null group by s.id order by s.title`);
      return r.rows;
    });
  }

  @Get('iqac/feedback-reports')
  @Auth('user', MANAGE)
  feedbackReports(@CurrentPrincipal() p: UserPrincipal, @Query('cycle') cycle?: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(iqacFeedbackReports).where(cycle ? eq(iqacFeedbackReports.cycle, this.cycle(cycle)) : undefined).orderBy(desc(iqacFeedbackReports.createdAt)));
  }

  @Post('iqac/feedback-reports')
  @Auth('user', ADMIN)
  addFeedbackReport(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FeedbackBody)) v: z.infer<typeof FeedbackBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.insert(iqacFeedbackReports).values({ tenantId: p.tenantId, cycle: v.cycle, stakeholder: v.stakeholder, summary: v.summary, averageRating: v.averageRating ?? null, responses: v.responses ?? null, actionTaken: v.actionTaken, status: v.actionTaken ? 'action_taken' : 'analysed', createdBy: p.userId }).returning();
      await auditUser(tx, p, 'iqac.feedback_report_added', 'iqac_feedback_report', r.id);
      return r;
    });
  }

  @Put('iqac/feedback-reports/:id')
  @Auth('user', ADMIN)
  updateFeedbackReport(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FeedbackPatch)) v: z.infer<typeof FeedbackPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const status = v.status ?? (v.actionTaken ? 'action_taken' : undefined);
      if (status === 'action_taken' && (await qualitySettings(tx, p.tenantId, 'feedback')).rules.actionTextRequired) {
        const [cur] = await tx.select({ a: iqacFeedbackReports.actionTaken }).from(iqacFeedbackReports).where(eq(iqacFeedbackReports.id, id));
        if (cur && !(v.actionTaken ?? cur.a).trim()) throw new BadRequestException('Describe the action taken');
      }
      const [r] = await tx.update(iqacFeedbackReports).set({ ...v, ...(status ? { status } : {}) }).where(eq(iqacFeedbackReports.id, id)).returning();
      if (!r) throw new NotFoundException('Report not found');
      await auditUser(tx, p, 'iqac.feedback_report_updated', 'iqac_feedback_report', id, { status: r.status });
      return r;
    });
  }

  /** Action taken report: feedback analysis and the action taken on it, plus IQAC meeting actions. */
  @Get('iqac/atr.xlsx')
  @Auth('user', MANAGE)
  async atr(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Query('cycle') cycle?: string) {
    const c = this.cycle(cycle);
    const d = await this.db.withTenant(p.tenantId, async (tx) => ({
      fb: await tx.select().from(iqacFeedbackReports).where(eq(iqacFeedbackReports.cycle, c)).orderBy(asc(iqacFeedbackReports.stakeholder)),
      acts: (await tx.execute(sql`select m.title as meeting, m.meeting_on::text as on, a.action, a.owner_name, a.due_on::text as due, a.status, a.action_taken from iqac_actions a join iqac_meetings m on m.id = a.meeting_id order by m.meeting_on desc, a.created_at`)).rows as Record<string, string>[],
    }));
    const sheets: Sheet[] = [
      { name: 'Feedback and action taken', rows: [[`Stakeholder feedback analysis and action taken report, cycle ${c}`], [], ['Stakeholder', 'Responses', 'Average rating', 'Analysis', 'Action taken', 'Status'], ...d.fb.map((f) => [f.stakeholder, f.responses, f.averageRating, f.summary, f.actionTaken, f.status])], widths: [14, 10, 12, 60, 60, 14] },
      { name: 'IQAC actions', rows: [['Meeting', 'Date', 'Action', 'Owner', 'Due', 'Status', 'Action taken'], ...d.acts.map((a) => [a.meeting, a.on, a.action, a.owner_name, a.due, a.status, a.action_taken])], widths: [30, 12, 50, 20, 12, 10, 50] },
    ];
    this.send(res, `iqac-atr-${c}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx(sheets, this.clock.now()));
  }

  // ---- faculty evidence --------------------------------------------------------------------------------------

  /** A teacher adds evidence of their own work (publication, FDP, award, patent) that the ERP does not hold. */
  @Post('my-evidence')
  @Auth('user', FACULTY)
  async addMine(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FacultyBody)) v: z.infer<typeof FacultyBody>) {
    const blob = await this.storeBlob(p, v.file);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.insert(facultyEvidence).values({ tenantId: p.tenantId, userId: p.userId, kind: v.kind, title: v.title, year: v.year ?? null, venue: v.venue, url: v.url ?? null, ...blob }).returning();
      await auditUser(tx, p, 'accreditation.faculty_evidence_added', 'faculty_evidence', r.id, { kind: v.kind });
      return r;
    });
  }

  @Get('my-evidence')
  @Auth('user', FACULTY)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(facultyEvidence).where(eq(facultyEvidence.userId, p.userId)).orderBy(desc(facultyEvidence.createdAt)));
  }

  /** Attaches the certificate or first page of a paper to one's own evidence (multipart field `file`). */
  @Post('my-evidence/:id/file')
  @Auth('user', FACULTY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE, files: 1 } }))
  async mineFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    const { key, name } = await this.store(p, file, `accreditation/faculty/${id}`);
    try {
      return await this.db.withTenant(p.tenantId, async (tx) => {
        const [r] = await tx.update(facultyEvidence).set({ fileKey: key, fileName: name }).where(and(eq(facultyEvidence.id, id), eq(facultyEvidence.userId, p.userId))).returning();
        if (!r) throw new NotFoundException('Evidence not found');
        await auditUser(tx, p, 'accreditation.faculty_evidence_file', 'faculty_evidence', id);
        return r;
      });
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  /** All teacher-uploaded evidence, for the quality team to verify. */
  @Get('faculty-evidence')
  @Auth('user', MANAGE)
  allFaculty(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: facultyEvidence.id, userId: facultyEvidence.userId, teacher: users.fullName, kind: facultyEvidence.kind, title: facultyEvidence.title, year: facultyEvidence.year, venue: facultyEvidence.venue, url: facultyEvidence.url, fileName: facultyEvidence.fileName, verified: facultyEvidence.verified }).from(facultyEvidence).innerJoin(users, eq(users.id, facultyEvidence.userId)).orderBy(desc(facultyEvidence.createdAt)));
  }

  @Post('faculty-evidence/:id/verify')
  @Auth('user', ADMIN)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.update(facultyEvidence).set({ verified: true, verifiedBy: p.userId }).where(eq(facultyEvidence.id, id)).returning();
      if (!r) throw new NotFoundException('Evidence not found');
      await auditUser(tx, p, 'accreditation.faculty_evidence_verified', 'faculty_evidence', id);
      return r;
    });
  }
}
