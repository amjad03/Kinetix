import { BadRequestException, BeforeApplicationShutdown, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { PdfWriter, toCsv } from '../common/pdf.js';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { tenants, userRoles, users } from '../db/schema.js';
import { reportRuns, reportSchedules } from '../db/schema-foundation.js';
import { reportRunsTotal } from '../observability/metrics.js';
import { buildPack, type Framework, type Pack } from './accreditation.js';
import { exportCell, reportByKey, type ReportData, type ReportDef, type RunCtx } from './catalogue.js';
import { Mailer } from './mailer.js';
import { addDays, resolveRange } from './queries.js';
import { zip } from './zip.js';

const Uuid = z.uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
export const ParamsSchema = z.object({ campusId: Uuid.optional(), programId: Uuid.optional(), sectionId: Uuid.optional(), academicYearId: Uuid.optional(), from: Day.optional(), to: Day.optional(), by: z.enum(['campus', 'program', 'section']).optional() }).strict();
export type ReportParams = z.infer<typeof ParamsSchema>;
export const FORMATS = ['json', 'csv', 'pdf'] as const;
export type Format = (typeof FORMATS)[number];
export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface Rendered {
  contentType: string;
  filename: string;
  body: Buffer;
}

const MAX_PDF_ROWS = 400;
const SEND_HOUR = '06:00:00';

/** The next local 06:00 after `after` (`advance`: one weekly or monthly period on). Local arithmetic keeps the hour across daylight saving. */
export function nextRun(after: Date, frequency: Frequency, timezone: string, advance = false): Date {
  let date = localParts(after, timezone).date;
  if (advance && frequency === 'weekly') date = addDays(date, 7);
  if (advance && frequency === 'monthly') {
    const d = new Date(Date.parse(`${date}T00:00:00Z`));
    d.setUTCMonth(d.getUTCMonth() + 1, Math.min(d.getUTCDate(), 28));
    date = d.toISOString().slice(0, 10);
  }
  let at = zonedToInstant(date, SEND_HOUR, timezone);
  while (at <= after) at = zonedToInstant((date = addDays(date, 1)), SEND_HOUR, timezone);
  return at;
}

export function renderCsv(data: ReportData): Buffer {
  return Buffer.from('﻿' + toCsv([data.columns.map((c) => c.label), ...data.rows.map((r) => data.columns.map((c) => exportCell(c, r[c.key] ?? null)))]), 'utf8');
}

export function renderPdf(title: string, subtitle: string, data: ReportData): Buffer {
  const pdf = new PdfWriter();
  pdf.text(title, { size: 15, bold: true });
  pdf.text(subtitle, { size: 9 });
  pdf.gap(6);
  for (const s of data.summary ?? []) pdf.text(`${s.label}: ${s.value ?? '-'}`, { size: 10 });
  if (data.summary?.length) pdf.gap(6);
  const width = 515 / Math.max(1, data.columns.length);
  const xs = data.columns.map((_, i) => Math.round(i * width));
  pdf.row(data.columns.map((c) => c.label), xs, { bold: true });
  pdf.rule();
  for (const r of data.rows.slice(0, MAX_PDF_ROWS)) pdf.row(data.columns.map((c) => String(exportCell(c, r[c.key] ?? null))), xs);
  if (data.rows.length > MAX_PDF_ROWS) {
    pdf.gap(6);
    pdf.text(`${data.rows.length - MAX_PDF_ROWS} more rows: download the CSV for the full list.`, { size: 9 });
  }
  return pdf.build();
}

/** Runs catalogue reports, renders them, and delivers scheduled ones by email. */
@Injectable()
export class ReportsService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly log = new Logger(ReportsService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  constructor(
    private readonly db: DbService,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.REPORTS_POLL_MS > 0) {
      this.timer = setInterval(() => void this.runDue().catch((e) => this.log.error(e)), this.env.REPORTS_POLL_MS);
      this.timer.unref();
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  async tenantTimezone(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return t?.tz ?? 'Asia/Kolkata';
  }

  /** The scope and periods a report runs with (defaults: the trailing 30 days, and a year for annual figures). */
  async context(tx: Tx, params: ReportParams): Promise<RunCtx> {
    const timezone = await this.tenantTimezone(tx);
    const today = localParts(this.clock.now(), timezone).date;
    if (params.from && params.to && params.from > params.to) throw new BadRequestException('"From" must not be after "to"');
    return {
      scope: { campusId: params.campusId, programId: params.programId, sectionId: params.sectionId, academicYearId: params.academicYearId },
      range: resolveRange(today, params.from, params.to, 30),
      annual: resolveRange(today, params.from, params.to, 365),
      by: params.by ?? 'section',
      timezone,
      today,
    };
  }

  assertMayRun(def: ReportDef, roles: RoleName[]): void {
    if (!def.roles.some((r) => roles.includes(r))) throw new ForbiddenException('Insufficient role');
  }

  find(key: string): ReportDef {
    const def = reportByKey(key);
    if (!def) throw new NotFoundException('Report not found');
    return def;
  }

  async run(tx: Tx, def: ReportDef, params: ReportParams) {
    const ctx = await this.context(tx, params);
    const data = await def.run(tx, ctx);
    return { ctx, data };
  }

  render(def: ReportDef, data: ReportData, ctx: RunCtx, format: 'csv' | 'pdf'): Rendered {
    const stamp = ctx.today;
    const base = `${def.key.replace(/\./g, '-')}-${stamp}`;
    const subtitle = `${def.description} Period ${ctx.range.from} to ${ctx.range.to}. Generated ${stamp}.`;
    return format === 'csv' ? { contentType: 'text/csv; charset=utf-8', filename: `${base}.csv`, body: renderCsv(data) } : { contentType: 'application/pdf', filename: `${base}.pdf`, body: renderPdf(def.title, subtitle, data) };
  }

  /** Accreditation pack as JSON, or a ZIP with one CSV per table plus a README of the gaps. */
  async pack(tx: Tx, framework: Framework, params: ReportParams) {
    const ctx = await this.context(tx, params);
    return { ctx, pack: await buildPack(tx, framework, ctx.annual, this.clock.now()) };
  }

  packZip(pack: Pack): Rendered {
    const files = pack.tables.map((t) => ({ name: `${t.name}.csv`, data: renderCsv(t) }));
    const readme = `${pack.title}\nPeriod ${pack.period.from} to ${pack.period.to}\nGenerated ${pack.generatedAt}\n\nNot recorded in KINETIX (complete these by hand):\n${pack.gaps.map((g) => `- ${g}`).join('\n')}\n`;
    files.push({ name: 'README.txt', data: Buffer.from(readme, 'utf8') });
    return { contentType: 'application/zip', filename: `${pack.framework}-data-pack-${pack.period.to}.zip`, body: zip(files, this.clock.now()) };
  }

  async recordRun(tx: Tx, tenantId: string, v: { scheduleId?: string; key: string; params: ReportParams; format: string; rows: number; status: 'ok' | 'failed'; deliveredTo?: string[]; error?: string; requestedBy?: string }) {
    await tx.insert(reportRuns).values({ tenantId, scheduleId: v.scheduleId ?? null, reportKey: v.key, params: v.params as Record<string, string>, format: v.format, rowCount: v.rows, status: v.status, deliveredTo: v.deliveredTo ?? [], error: v.error?.slice(0, 500) ?? null, requestedBy: v.requestedBy ?? null });
    reportRunsTotal.inc({ report: v.key, outcome: v.status });
  }

  /** Recipients of a scheduled report must be active people of the institution who may see the report themselves. */
  async validateRecipients(tx: Tx, def: ReportDef, emails: string[]): Promise<string[]> {
    const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    const found = clean.length ? await tx.select({ id: users.id, email: users.email }).from(users).where(and(inArray(users.email, clean), eq(users.status, 'active'))) : [];
    const missing = clean.filter((e) => !found.some((f) => f.email === e));
    if (missing.length) throw new BadRequestException(`Not an active user of this institution: ${missing.join(', ')}`);
    const roleRows = found.length ? await tx.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles).where(inArray(userRoles.userId, found.map((f) => f.id))) : [];
    const denied = found.filter((f) => !roleRows.some((r) => r.userId === f.id && def.roles.includes(r.role as RoleName)));
    if (denied.length) throw new BadRequestException(`These people may not see this report: ${denied.map((d) => d.email).join(', ')}`);
    return clean;
  }

  /** Runs every schedule that is due (any instance; rows are claimed with SKIP LOCKED). Returns how many ran. */
  runDue(): Promise<number> {
    this.running ??= this.dueLoop().finally(() => (this.running = undefined));
    return this.running;
  }

  private async dueLoop(): Promise<number> {
    const due = await this.db.system
      .select({ id: reportSchedules.id, tenantId: reportSchedules.tenantId })
      .from(reportSchedules)
      .where(and(eq(reportSchedules.active, true), lte(reportSchedules.nextRunAt, this.clock.now())))
      .orderBy(asc(reportSchedules.nextRunAt))
      .limit(50);
    let n = 0;
    for (const d of due) if (await this.runSchedule(d.tenantId, d.id)) n++;
    return n;
  }

  private async runSchedule(tenantId: string, id: string): Promise<boolean> {
    const now = this.clock.now();
    // Claim and advance in one transaction so a second instance skips it; the delivery follows, its outcome recorded after.
    const claimed = await this.db.withTenant(tenantId, async (tx) => {
      const [s] = await tx.select().from(reportSchedules).where(and(eq(reportSchedules.id, id), eq(reportSchedules.active, true), lte(reportSchedules.nextRunAt, now))).for('update', { skipLocked: true });
      if (!s) return null;
      const tz = await this.tenantTimezone(tx);
      await tx.update(reportSchedules).set({ lastRunAt: now, nextRunAt: nextRun(s.nextRunAt > now ? s.nextRunAt : now, s.frequency as Frequency, tz, true) }).where(eq(reportSchedules.id, id));
      const roles = (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, s.createdBy))).map((r) => r.role as RoleName);
      const [creator] = await tx.select({ status: users.status }).from(users).where(eq(users.id, s.createdBy));
      return { s, roles, creatorActive: creator?.status === 'active' };
    });
    if (!claimed) return false;
    const { s, roles, creatorActive } = claimed;
    const def = reportByKey(s.reportKey);
    try {
      if (!def) throw new Error('The report no longer exists');
      // The schedule keeps only the access its creator still has.
      if (!creatorActive || !def.roles.some((r) => roles.includes(r))) {
        await this.db.withTenant(tenantId, async (tx) => {
          await tx.update(reportSchedules).set({ active: false }).where(eq(reportSchedules.id, id));
          await audit(tx, { tenantId, actorType: 'system', action: 'report.schedule_disabled', subjectType: 'report_schedule', subjectId: id, data: { reason: 'creator lost access' } });
        });
        throw new Error('The person who scheduled this report no longer has access to it; the schedule was switched off');
      }
      const { rendered, rowCount, subject } = await this.db.withTenant(tenantId, async (tx) => {
        const { ctx, data } = await this.run(tx, def, s.params as ReportParams);
        return { rendered: this.render(def, data, ctx, s.format as 'csv' | 'pdf'), rowCount: data.rows.length, subject: `${def.title} (${ctx.today})` };
      });
      await this.mailer.send({ to: s.recipients, subject: `KINETIX report: ${subject}`, text: `Your scheduled report "${def.title}" is attached (${rowCount} rows).\n\nSchedule: ${s.frequency}. To change or stop it, open Reports and analytics in the ERP.`, attachments: [{ filename: rendered.filename, contentType: rendered.contentType.split(';')[0], content: rendered.body }] });
      await this.db.withTenant(tenantId, async (tx) => {
        await this.recordRun(tx, tenantId, { scheduleId: id, key: s.reportKey, params: s.params as ReportParams, format: s.format, rows: rowCount, status: 'ok', deliveredTo: s.recipients });
        await audit(tx, { tenantId, actorType: 'system', action: 'report.scheduled_sent', subjectType: 'report_schedule', subjectId: id, data: { report: s.reportKey, recipients: s.recipients.length, rows: rowCount } });
      });
      return true;
    } catch (e) {
      this.log.warn(`Scheduled report ${s.reportKey} (${id}) failed: ${(e as Error).message}`);
      await this.db.withTenant(tenantId, (tx) => this.recordRun(tx, tenantId, { scheduleId: id, key: s.reportKey, params: s.params as ReportParams, format: s.format, rows: 0, status: 'failed', error: (e as Error).message }));
      return false;
    }
  }
}
