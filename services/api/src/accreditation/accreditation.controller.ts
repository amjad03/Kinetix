import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { zip } from '../analytics/zip.js';
import { ReportsService } from '../analytics/reports.service.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { BlobBody, putBlob, type BlobInput } from '../common/blob.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { accreditationEntries, dvvQueries, facultyEvidence, iqacActions, iqacFeedbackReports, iqacMeetings, iqacPractices } from '../db/schema-accreditation.js';
import { obeEvidence, users } from '../db/schema.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { AccreditationService, type Overview } from './accreditation.service.js';
import { BODIES, catalogue, type Body as BodyName } from './catalogue.js';
import { xlsx, type Cell, type Sheet } from './xlsx.js';

const MANAGE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const FACULTY: RoleName[] = ['teacher', 'hod', 'tenant_admin', 'principal', 'quality_officer'];
const MAX_FILE = 10 * 1024 * 1024;
const CYCLE = z.string().regex(/^\d{4}(-\d{2,4})?$/);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const EntryBody = z.object({
  cycle: CYCLE.optional(),
  value: z.number().min(-1e12).max(1e12).nullish(),
  textValue: z.string().max(8000).optional(),
  rows: z.array(z.array(z.string().max(500)).max(40)).max(2000).optional(),
  selfScore: z.number().min(0).max(4).nullish(),
  note: z.string().max(2000).optional(),
});
const EvidenceBody = z.object({ cycle: CYCLE.optional(), file: BlobBody.optional(), title: z.string().trim().min(2).max(200), url: z.url().optional(), note: z.string().trim().max(2000).optional() });
const DvvBody = z.object({ cycle: CYCLE, metricCode: z.string().trim().min(1).max(24), query: z.string().trim().min(3).max(2000) });
const DvvPatch = z.object({ response: z.string().trim().max(4000).optional(), status: z.enum(['open', 'answered', 'closed']).optional() });
const MeetingBody = z.object({ title: z.string().trim().min(2).max(200), meetingOn: DATE, agenda: z.string().max(4000).default(''), minutes: z.string().max(12000).default(''), attendees: z.string().max(2000).default('') });
const ActionBody = z.object({ action: z.string().trim().min(2).max(1000), ownerName: z.string().trim().max(120).default(''), dueOn: DATE.nullish() });
const ActionPatch = z.object({ status: z.enum(['open', 'done']).optional(), actionTaken: z.string().max(4000).optional() });
const PracticeBody = z.object({ kind: z.enum(['best_practice', 'distinctiveness']), title: z.string().trim().min(2).max(200), year: z.string().max(20).default(''), objectives: z.string().max(4000).default(''), context: z.string().max(4000).default(''), practice: z.string().max(8000).default(''), evidence: z.string().max(4000).default(''), problems: z.string().max(4000).default('') });
const FeedbackBody = z.object({ cycle: CYCLE, stakeholder: z.enum(['students', 'teachers', 'employers', 'alumni', 'parents']), summary: z.string().trim().min(3).max(4000), averageRating: z.number().min(0).max(10).nullish(), responses: z.number().int().min(0).max(32000).nullish(), actionTaken: z.string().max(4000).default('') });
const FeedbackPatch = z.object({ actionTaken: z.string().max(4000).optional(), status: z.enum(['analysed', 'action_planned', 'action_taken']).optional(), summary: z.string().trim().min(3).max(4000).optional() });
const FacultyBody = z.object({ file: BlobBody.optional(), kind: z.enum(['publication', 'fdp', 'award', 'patent', 'book', 'other']), title: z.string().trim().min(2).max(300), year: z.number().int().min(1950).max(2100).nullish(), venue: z.string().trim().max(300).default(''), url: z.url().optional() });

/** NAAC SSR/AQAR, NBA SAR, NIRF and AISHE data, the IQAC workspace and teacher-uploaded evidence (PRD sections 24 and 28). */
@Controller('v1/accreditation')
export class AccreditationController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly svc: AccreditationService,
    private readonly reports: ReportsService,
    private readonly storage: ObjectStorage,
    private readonly scans: UploadScanService,
  ) {}

  /** The cycle (academic year) in force today, for example 2026-27; used when a request names none. */
  private cycle(q?: string): string {
    if (q) {
      if (!CYCLE.safeParse(q).success) throw new BadRequestException('Cycle must look like 2026-27');
      return q;
    }
    const d = this.clock.now();
    const y = d.getUTCMonth() >= 5 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  }

  private body(b: string): BodyName {
    if (!BODIES.includes(b as BodyName)) throw new NotFoundException('Unknown framework; use naac, nba or nirf');
    return b as BodyName;
  }

  private def(body: BodyName, code: string) {
    const d = catalogue(body).metrics.find((m) => m.code === code);
    if (!d) throw new NotFoundException('Metric not found');
    return d;
  }

  private send(res: Response, name: string, type: string, buf: Buffer) {
    res.set({ 'content-type': type, 'content-length': String(buf.length), 'content-disposition': `attachment; filename="${name}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    res.end(buf);
  }

  // ---- metrics -----------------------------------------------------------------------------------------

  /** Every metric of a framework with its figure (entered or computed), score, evidence count, completeness and the predicted score. */
  @Get(':body/overview')
  @Auth('user', MANAGE)
  overview(@CurrentPrincipal() p: UserPrincipal, @Param('body') b: string, @Query('cycle') cycle?: string) {
    const body = this.body(b);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.overview(tx, body, c));
  }

  /** Saves the figure, data-template rows, narrative or own marking for a metric; sending nothing for a field leaves it as it was. */
  @Put(':body/metrics/:code')
  @Auth('user', ADMIN)
  save(@CurrentPrincipal() p: UserPrincipal, @Param('body') b: string, @Param('code') code: string, @Body(new ZodBody(EntryBody)) v: z.infer<typeof EntryBody>, @Query('cycle') cycle?: string) {
    const body = this.body(b);
    this.def(body, code);
    const c = this.cycle(v.cycle ?? cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const row = await this.ensureEntry(tx, p, body, c, code);
      const patch: Partial<typeof accreditationEntries.$inferInsert> = { updatedBy: p.userId, updatedAt: new Date() };
      if (v.value !== undefined) patch.value = v.value;
      if (v.textValue !== undefined) patch.textValue = v.textValue;
      if (v.rows !== undefined) patch.dataRows = v.rows;
      if (v.selfScore !== undefined) patch.selfScore = v.selfScore;
      if (v.note !== undefined) patch.note = v.note;
      const [r] = await tx.update(accreditationEntries).set(patch).where(eq(accreditationEntries.id, row.id)).returning();
      await auditUser(tx, p, 'accreditation.metric_saved', 'accreditation_entry', row.id, { body, cycle: c, code });
      return r;
    });
  }

  private async ensureEntry(tx: Tx, p: UserPrincipal, body: BodyName, cycle: string, code: string) {
    await tx.insert(accreditationEntries).values({ tenantId: p.tenantId, body, cycle, metricCode: code, updatedBy: p.userId }).onConflictDoNothing();
    const [row] = await tx.select().from(accreditationEntries).where(and(eq(accreditationEntries.body, body), eq(accreditationEntries.cycle, cycle), eq(accreditationEntries.metricCode, code)));
    return row;
  }

  @Get(':body/metrics/:code/evidence')
  @Auth('user', MANAGE)
  evidence(@CurrentPrincipal() p: UserPrincipal, @Param('body') b: string, @Param('code') code: string, @Query('cycle') cycle?: string) {
    const body = this.body(b);
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.select({ id: accreditationEntries.id }).from(accreditationEntries).where(and(eq(accreditationEntries.body, body), eq(accreditationEntries.cycle, c), eq(accreditationEntries.metricCode, code)));
      if (!e) return [];
      return tx.select({ id: obeEvidence.id, title: obeEvidence.title, url: obeEvidence.url, note: obeEvidence.note, fileName: obeEvidence.fileName, createdAt: obeEvidence.createdAt }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'metric'), eq(obeEvidence.targetId, e.id))).orderBy(asc(obeEvidence.createdAt));
    });
  }

  /** Adds a link or note as evidence for a metric; attach a file with `POST evidence/:id/file`. */
  @Post(':body/metrics/:code/evidence')
  @Auth('user', ADMIN)
  async addEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('body') b: string, @Param('code') code: string, @Body(new ZodBody(EvidenceBody)) v: z.infer<typeof EvidenceBody>, @Query('cycle') cycle?: string) {
    const body = this.body(b);
    this.def(body, code);
    const c = this.cycle(v.cycle ?? cycle);
    const blob = await this.storeBlob(p, v.file);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.ensureEntry(tx, p, body, c, code);
      const [row] = await tx.insert(obeEvidence).values({ tenantId: p.tenantId, programId: null, scope: 'metric', targetId: e.id, title: v.title, url: v.url ?? null, note: v.note ?? null, uploadedBy: p.userId, ...blob }).returning();
      await auditUser(tx, p, 'accreditation.evidence_added', 'obe_evidence', row.id, { body, cycle: c, code });
      return row;
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
        if (!e || e.scope !== 'metric') throw new NotFoundException('Evidence not found');
        const [r] = await tx.update(obeEvidence).set({ fileKey: key, fileName: name }).where(eq(obeEvidence.id, id)).returning();
        await auditUser(tx, p, 'accreditation.evidence_file_uploaded', 'obe_evidence', id);
        return r;
      });
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
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

  // ---- data templates and exports ----------------------------------------------------------------------------

  /** The blank data template for one metric, to fill in and upload as evidence. */
  @Get(':body/metrics/:code/template.xlsx')
  @Auth('user', MANAGE)
  template(@Param('body') b: string, @Param('code') code: string, @Res() res: Response) {
    const d = this.def(this.body(b), code);
    const rows: Cell[][] = [[`${b.toUpperCase()} metric ${d.code} (${d.kind})`], [d.title], [d.unit ? `Unit: ${d.unit}` : ''], [], d.columns.length ? d.columns : ['Narrative (about 500 words)']];
    this.send(res, `${b}-${code}-template.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx([{ name: code, rows }]));
  }

  private metricSheet(o: Overview, m: Overview['metrics'][number], inst: string): Sheet {
    const rows: Cell[][] = [[`${o.body.toUpperCase()} metric ${m.code} (${m.kind}), cycle ${o.cycle}`, inst], [m.title], [m.unit ? `Unit: ${m.unit}` : ''], []];
    if (m.kind === 'QnM') rows.push(['Value', m.value ?? '', m.source === 'auto' ? 'Computed from ERP data' : m.source === 'manual' ? 'Entered by the institution' : 'Not yet available'], []);
    if (m.autoText) rows.push(['Basis', m.autoText], []);
    if (m.textValue) rows.push(['Narrative', m.textValue], []);
    const data = m.rows.length ? m.rows : [];
    if (m.columns.length) rows.push(m.columns, ...data);
    return { name: m.code, rows, widths: [28, 30, 26, 26, 26, 26] };
  }

  /** NAAC export: one workbook per metric (criterion folders), a summary with the predicted CGPA, the DVV clarification list and the data gaps. */
  @Get('naac/export.zip')
  @Auth('user', ADMIN)
  async naacExport(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Query('cycle') cycle?: string) {
    const c = this.cycle(cycle);
    const { o, inst, dvv } = await this.db.withTenant(p.tenantId, async (tx) => {
      const o = await this.svc.overview(tx, 'naac', c);
      const [t] = (await tx.execute(sql`select name from tenants where id = ${p.tenantId}::uuid`)).rows as { name: string }[];
      await auditUser(tx, p, 'accreditation.naac_exported', 'accreditation', undefined, { cycle: c, metrics: o.metrics.length });
      return { o, inst: t?.name ?? '', dvv: await this.svc.dvv(tx, c) };
    });
    const at = this.clock.now();
    const files = o.metrics.map((m) => ({ name: `Criterion ${m.group}/${m.code}.xlsx`, data: xlsx([this.metricSheet(o, m, inst)], at) }));
    files.push({ name: 'Summary.xlsx', data: xlsx(this.summarySheets(o, inst), at) });
    files.push({ name: 'DVV clarifications.xlsx', data: xlsx([this.dvvSheet(dvv, c)], at) });
    const gaps = o.metrics.filter((m) => !m.complete).map((m) => `${m.code}  ${m.title}`);
    const readme = `NAAC data for ${inst}, cycle ${c}\nGenerated ${at.toISOString()}\n\nEach file under "Criterion N" holds one metric: the value, the basis and the data table in the template columns. The predicted score is an estimate, not a NAAC result.\n\nMetrics still to complete (${gaps.length}):\n${gaps.map((g) => `- ${g}`).join('\n')}\n`;
    files.push({ name: 'README.txt', data: Buffer.from(readme, 'utf8') });
    this.send(res, `naac-${c}.zip`, 'application/zip', zip(files, at));
  }

  private summarySheets(o: Overview, inst: string): Sheet[] {
    const head: Cell[][] = [[`${o.body.toUpperCase()} summary, ${inst}, cycle ${o.cycle}`], [`Completeness: ${o.completeness.complete} of ${o.completeness.total} metrics (${o.completeness.percent}%)`]];
    if (o.estimate) head.push([`Predicted CGPA ${o.estimate.estimate ?? '-'} (${o.estimate.grade}); floor if unfilled metrics score zero ${o.estimate.floor} (${o.estimate.floorGrade})`]);
    head.push([]);
    const crit: Cell[][] = [['Criterion', 'Title', 'Weight', 'Metrics', 'Complete', 'Scored', 'Mean points out of 4'], ...o.groups.map((g) => [g.id, g.title, g.weight, g.metrics, g.complete, g.scored, g.mean])];
    const list: Cell[][] = [['Metric', 'Type', 'Title', 'Unit', 'Value', 'Source', 'Points', 'Evidence files', 'Complete'], ...o.metrics.map((m) => [m.code, m.kind, m.title, m.unit, m.value, m.source, m.score, m.evidence, m.complete ? 'Yes' : 'No'])];
    return [{ name: 'Summary', rows: [...head, ...crit], widths: [14, 48, 10, 10, 10, 10, 18] }, { name: 'Metrics', rows: list, widths: [10, 8, 70, 16, 12, 10, 8, 14, 10] }];
  }

  private dvvSheet(rows: { metricCode: string; query: string; response: string; status: string }[], cycle: string): Sheet {
    return { name: 'DVV clarifications', rows: [[`DVV clarification list, cycle ${cycle}`], [], ['Metric', 'Clarification asked', 'Institution response', 'Status'], ...rows.map((r) => [r.metricCode, r.query, r.response, r.status])], widths: [10, 60, 60, 12] };
  }

  /** NBA SAR export: criteria tables, CO and PO attainment pulled from OBE, and the CO-PO matrix. */
  @Get('nba/export.xlsx')
  @Auth('user', MANAGE)
  async nbaExport(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Query('cycle') cycle?: string, @Query('tier') tier = '1') {
    if (tier !== '1' && tier !== '2') throw new BadRequestException('tier must be 1 or 2');
    const c = this.cycle(cycle);
    const d = await this.db.withTenant(p.tenantId, async (tx) => {
      const o = await this.svc.overview(tx, 'nba', c);
      const [t] = (await tx.execute(sql`select name from tenants where id = ${p.tenantId}::uuid`)).rows as { name: string }[];
      await auditUser(tx, p, 'accreditation.nba_exported', 'accreditation', undefined, { cycle: c, tier });
      return { o, inst: t?.name ?? '', att: await this.svc.attainmentRows(tx), matrix: await this.svc.coPoMatrix(tx) };
    });
    const sheets: Sheet[] = this.summarySheets(d.o, d.inst);
    sheets[0].rows.splice(0, 1, [`NBA SAR Tier-${tier} data, ${d.inst}, cycle ${c}`]);
    for (const g of d.o.groups) {
      const mine = d.o.metrics.filter((m) => m.group === g.id);
      const rows: Cell[][] = [[`Criterion ${g.id}: ${g.title}`], []];
      for (const m of mine) {
        rows.push([m.code, m.title], ['', m.kind === 'QnM' ? `Value: ${m.value ?? 'not available'} ${m.unit}` : m.textValue || m.autoText || 'Narrative not written']);
        if (m.columns.length && m.rows.length) rows.push(m.columns, ...m.rows);
        rows.push([]);
      }
      sheets.push({ name: `Criterion ${g.id}`, rows, widths: [10, 90, 24, 24] });
    }
    sheets.push({ name: 'CO-PO attainment', rows: [['Programme', 'Level', 'Code', 'Direct', 'Indirect', 'Attainment', 'Target', 'Gap', 'Met'], ...d.att.map((a) => [a.program, a.scope === 'po' ? 'PO/PSO' : 'CO', a.code, a.direct, a.indirect, a.combined, a.target, a.gap, a.met ? 'Yes' : 'No'])], widths: [30, 10, 12, 10, 10, 12, 10, 10, 8] });
    sheets.push({ name: 'CO-PO matrix', rows: [['Programme', 'Course outcome', 'Programme outcome', 'Strength (1-3)'], ...d.matrix.map((m) => [m.program, m.co, m.po, m.strength])], widths: [30, 18, 18, 14] });
    this.send(res, `nba-sar-tier${tier}-${c}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx(sheets, this.clock.now()));
  }

  /** NIRF data capture sheets (TLR, RP, GO, OI, PR) filled from ERP data and manual entries. */
  @Get('nirf/export.xlsx')
  @Auth('user', ADMIN)
  async nirfExport(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Query('cycle') cycle?: string) {
    const c = this.cycle(cycle);
    const { o, inst } = await this.db.withTenant(p.tenantId, async (tx) => {
      const o = await this.svc.overview(tx, 'nirf', c);
      const [t] = (await tx.execute(sql`select name from tenants where id = ${p.tenantId}::uuid`)).rows as { name: string }[];
      await auditUser(tx, p, 'accreditation.nirf_exported', 'accreditation', undefined, { cycle: c });
      return { o, inst: t?.name ?? '' };
    });
    const sheets: Sheet[] = [{ name: 'Summary', rows: [[`NIRF data capture, ${inst}, cycle ${c}`], [`Completeness: ${o.completeness.complete} of ${o.completeness.total} parameters`], [], ['Parameter', 'Group', 'Item', 'Unit', 'Value', 'Source'], ...o.metrics.map((m) => [m.code, m.group, m.title, m.unit, m.value, m.source === 'auto' ? 'Computed from ERP data' : m.source === 'manual' ? 'Entered' : 'To be entered'])], widths: [12, 8, 60, 12, 12, 24] }];
    for (const g of o.groups) {
      const rows: Cell[][] = [[`${g.id}: ${g.title}`], []];
      for (const m of o.metrics.filter((x) => x.group === g.id)) {
        rows.push([m.code, m.title, m.value, m.unit]);
        if (m.columns.length && m.rows.length) rows.push(m.columns, ...m.rows);
      }
      sheets.push({ name: g.id, rows, widths: [12, 60, 14, 14, 20] });
    }
    this.send(res, `nirf-${c}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx(sheets, this.clock.now()));
  }

  /** AISHE data collection form (DCF) tables from ERP data, with a sheet listing what must be completed by hand. */
  @Get('aishe/export.xlsx')
  @Auth('user', ADMIN)
  async aisheExport(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response) {
    const pack = await this.db.withTenant(p.tenantId, async (tx) => {
      const { pack } = await this.reports.pack(tx, 'aishe', {});
      await auditUser(tx, p, 'accreditation.aishe_exported', 'accreditation', undefined, { tables: pack.tables.length });
      return pack;
    });
    const sheets: Sheet[] = pack.tables.map((t) => ({ name: t.title, rows: [t.columns.map((col) => col.label), ...t.rows.map((r) => t.columns.map((col) => (r[col.key] ?? '') as Cell))] }));
    sheets.push({ name: 'To complete by hand', rows: [[pack.title], [`Period ${pack.period.from} to ${pack.period.to}`], [], ['Not recorded in KINETIX'], ...pack.gaps.map((g) => [g])], widths: [100] });
    this.send(res, `aishe-dcf-${pack.period.to}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx(sheets, this.clock.now()));
  }

  // ---- DVV clarifications ------------------------------------------------------------------------------------

  @Get('dvv')
  @Auth('user', MANAGE)
  dvvList(@CurrentPrincipal() p: UserPrincipal, @Query('cycle') cycle?: string) {
    const c = this.cycle(cycle);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.dvv(tx, c));
  }

  @Post('dvv')
  @Auth('user', ADMIN)
  dvvAdd(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DvvBody)) v: z.infer<typeof DvvBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.insert(dvvQueries).values({ tenantId: p.tenantId, cycle: v.cycle, metricCode: v.metricCode, query: v.query, raisedBy: p.userId }).returning();
      await auditUser(tx, p, 'accreditation.dvv_raised', 'dvv_query', r.id);
      return r;
    });
  }

  @Put('dvv/:id')
  @Auth('user', ADMIN)
  dvvUpdate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DvvPatch)) v: z.infer<typeof DvvPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const status = v.status ?? (v.response ? 'answered' : undefined);
      const [r] = await tx.update(dvvQueries).set({ ...(v.response !== undefined ? { response: v.response } : {}), ...(status ? { status } : {}), ...(v.response ? { answeredAt: new Date() } : {}) }).where(eq(dvvQueries.id, id)).returning();
      if (!r) throw new NotFoundException('Clarification not found');
      await auditUser(tx, p, 'accreditation.dvv_updated', 'dvv_query', id, { status: r.status });
      return r;
    });
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
