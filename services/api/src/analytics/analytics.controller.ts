import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { campuses, programs, sections } from '../db/schema.js';
import { reportRuns, reportSchedules } from '../db/schema-foundation.js';
import { RequireFeature } from '../flags/flags.js';
import { FRAMEWORKS, type Framework } from './accreditation.js';
import { reportsFor } from './catalogue.js';
import { classroomAnalytics, drilldown, institutionKpis, LEVELS, METRICS, rows as sqlRows, type Metric } from './queries.js';
import { FORMATS, FREQUENCIES, nextRun, ParamsSchema, ReportsService, type ReportParams } from './reports.service.js';

const MGMT: RoleName[] = ['tenant_admin', 'principal'];
const ACADEMIC: RoleName[] = [...MGMT, 'hod'];
const FINANCE: RoleName[] = [...MGMT, 'accountant'];
/** Everyone who can open some report; each report then checks its own roles. */
const ANALYTICS_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod', 'accountant', 'hr_manager'];
const METRIC_ROLES: Record<Metric, RoleName[]> = { enrolment: ACADEMIC, attendance: ACADEMIC, results: ACADEMIC, coverage: ACADEMIC, fees: FINANCE };

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const RunBody = z.object({ params: ParamsSchema.default({}), format: z.enum(FORMATS).default('json') });
const ScheduleBody = z.object({
  reportKey: z.string().min(3).max(60),
  params: ParamsSchema.default({}),
  frequency: z.enum(FREQUENCIES),
  format: z.enum(['csv', 'pdf']).default('csv'),
  recipients: z.array(z.email().max(200)).min(1).max(20),
});
const SchedulePatch = z.object({ active: z.boolean().optional(), frequency: z.enum(FREQUENCIES).optional(), format: z.enum(['csv', 'pdf']).optional(), recipients: z.array(z.email().max(200)).min(1).max(20).optional() }).refine((b) => Object.keys(b).length > 0, 'Nothing to change');

const parseParams = (q: unknown): ReportParams => {
  const r = ParamsSchema.safeParse(q);
  if (!r.success) throw new BadRequestException(z.flattenError(r.error));
  return r.data;
};

/** Reports and analytics: KPIs, drill-downs, the report catalogue with schedules and export, classroom analytics and accreditation packs. */
@Controller('v1/analytics')
@RequireFeature('analytics.reports')
export class AnalyticsController {
  constructor(
    private readonly db: DbService,
    private readonly reports: ReportsService,
    private readonly clock: Clock,
  ) {}

  /** Campuses, programs and classes for the filters. */
  @Get('filters')
  @Auth('user', ANALYTICS_ROLES)
  filters(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      campuses: await tx.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(asc(campuses.name)),
      programs: await tx.select({ id: programs.id, campusId: programs.campusId, name: programs.name }).from(programs).orderBy(asc(programs.name)),
      sections: await tx.select({ id: sections.id, programId: sections.programId, name: sections.displayName }).from(sections).orderBy(asc(sections.displayName)),
    }));
  }

  @Get('kpis')
  @Auth('user', MGMT)
  kpis(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    const params = parseParams(q);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.reports.context(tx, params);
      return institutionKpis(tx, ctx.scope, ctx.range, ctx.annual, ctx.timezone, ctx.today);
    });
  }

  /** `?metric=enrolment|attendance|fees|results|coverage&by=campus|program|section` plus the scope filters. */
  @Get('drilldown')
  @Auth('user', ANALYTICS_ROLES)
  drill(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    const { metric, by, ...rest } = q;
    if (!METRICS.includes(metric as Metric)) throw new BadRequestException(`metric must be one of ${METRICS.join(', ')}`);
    if (!LEVELS.includes(by as (typeof LEVELS)[number])) throw new BadRequestException(`by must be one of ${LEVELS.join(', ')}`);
    if (!p.roles.some((r) => METRIC_ROLES[metric as Metric].includes(r))) throw new ForbiddenException('Insufficient role');
    const params = parseParams(rest);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.reports.context(tx, params);
      return { metric, by, range: ctx.range, rows: await drilldown(tx, metric as Metric, by as (typeof LEVELS)[number], ctx.scope, ctx.range, ctx.timezone, ctx.today) };
    });
  }

  /** Session usage, tool usage and syllabus coverage from the board. */
  @Get('classroom')
  @RequireFeature('classroom.analytics')
  @Auth('user', ACADEMIC)
  classroom(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    const params = parseParams(q);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.reports.context(tx, params);
      return classroomAnalytics(tx, ctx.scope, ctx.range, ctx.timezone, ctx.today);
    });
  }

  // ----- catalogue and export -------------------------------------------------------------------------

  @Get('reports')
  @Auth('user', ANALYTICS_ROLES)
  catalogue(@CurrentPrincipal() p: UserPrincipal) {
    return reportsFor(p.roles).map(({ key, title, description, category, params }) => ({ key, title, description, category, params }));
  }

  /** Runs a report: JSON rows, or a CSV or PDF download. Every run is audited. */
  @Post('reports/:key/run')
  @HttpCode(200)
  @Auth('user', ANALYTICS_ROLES)
  async run(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string, @Body(new ZodBody(RunBody)) body: z.infer<typeof RunBody>, @Res({ passthrough: true }) res: Response) {
    const def = this.reports.find(key);
    this.reports.assertMayRun(def, p.roles);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { ctx, data } = await this.reports.run(tx, def, body.params);
      await this.reports.recordRun(tx, p.tenantId, { key, params: body.params, format: body.format, rows: data.rows.length, status: 'ok', requestedBy: p.userId });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.run', subjectType: 'report', data: { key, format: body.format, params: body.params, rows: data.rows.length } });
      if (body.format === 'json') return { key, title: def.title, generatedAt: this.clock.now().toISOString(), range: ctx.range, ...data };
      const out = this.reports.render(def, data, ctx, body.format);
      res.setHeader('Content-Type', out.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(out.body);
    });
  }

  /** The same as `run`, for a plain download link: `?format=csv|pdf` plus the report's parameters. */
  @Get('reports/:key/export')
  @Auth('user', ANALYTICS_ROLES)
  async exportReport(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const { format, ...rest } = q;
    if (format !== 'csv' && format !== 'pdf') throw new BadRequestException('format must be csv or pdf');
    return this.run(p, key, { params: parseParams(rest), format }, res);
  }

  @Get('runs')
  @Auth('user', ANALYTICS_ROLES)
  runs(@CurrentPrincipal() p: UserPrincipal) {
    const keys = reportsFor(p.roles).map((r) => r.key);
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(reportRuns).where(inArray(reportRuns.reportKey, keys)).orderBy(desc(reportRuns.createdAt)).limit(100),
    );
  }

  // ----- schedules ----------------------------------------------------------------------------------------

  @Get('schedules')
  @Auth('user', ANALYTICS_ROLES)
  schedules(@CurrentPrincipal() p: UserPrincipal) {
    const keys = reportsFor(p.roles).map((r) => r.key);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mine = p.roles.some((r) => MGMT.includes(r));
      const list = await tx.select().from(reportSchedules).where(and(inArray(reportSchedules.reportKey, keys), mine ? undefined : eq(reportSchedules.createdBy, p.userId))).orderBy(asc(reportSchedules.nextRunAt));
      return list;
    });
  }

  @Post('schedules')
  @Auth('user', ANALYTICS_ROLES)
  createSchedule(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ScheduleBody)) b: z.infer<typeof ScheduleBody>) {
    const def = this.reports.find(b.reportKey);
    this.reports.assertMayRun(def, p.roles);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const recipients = await this.reports.validateRecipients(tx, def, b.recipients);
      const tz = await this.reports.tenantTimezone(tx);
      const [row] = await tx
        .insert(reportSchedules)
        .values({ tenantId: p.tenantId, reportKey: b.reportKey, params: b.params as Record<string, string>, frequency: b.frequency, format: b.format, recipients, nextRunAt: nextRun(this.clock.now(), b.frequency, tz), createdBy: p.userId })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_created', subjectType: 'report_schedule', subjectId: row.id, data: { key: b.reportKey, frequency: b.frequency, format: b.format, recipients } });
      return row;
    });
  }

  @Patch('schedules/:id')
  @Auth('user', ANALYTICS_ROLES)
  updateSchedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SchedulePatch)) b: z.infer<typeof SchedulePatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.own(tx, p, id);
      const def = this.reports.find(s.reportKey);
      this.reports.assertMayRun(def, p.roles);
      const recipients = b.recipients ? await this.reports.validateRecipients(tx, def, b.recipients) : undefined;
      const tz = await this.reports.tenantTimezone(tx);
      const frequency = b.frequency ?? (s.frequency as (typeof FREQUENCIES)[number]);
      const [row] = await tx
        .update(reportSchedules)
        .set({ ...(b.active !== undefined ? { active: b.active } : {}), ...(b.format ? { format: b.format } : {}), ...(recipients ? { recipients } : {}), ...(b.frequency ? { frequency: b.frequency } : {}), ...(b.active || b.frequency ? { nextRunAt: nextRun(this.clock.now(), frequency, tz) } : {}) })
        .where(eq(reportSchedules.id, id))
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_updated', subjectType: 'report_schedule', subjectId: id, data: b });
      return row;
    });
  }

  @Delete('schedules/:id')
  @HttpCode(204)
  @Auth('user', ANALYTICS_ROLES)
  deleteSchedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.own(tx, p, id);
      await tx.delete(reportSchedules).where(eq(reportSchedules.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_deleted', subjectType: 'report_schedule', subjectId: id, data: { key: s.reportKey } });
    });
  }

  private async own(tx: Tx, p: UserPrincipal, id: string) {
    const [s] = await tx.select().from(reportSchedules).where(eq(reportSchedules.id, id));
    if (!s || (s.createdBy !== p.userId && !p.roles.some((r) => MGMT.includes(r)))) throw new NotFoundException('Schedule not found');
    return s;
  }

  // ----- accreditation packs ---------------------------------------------------------------------------

  /** NAAC, NIRF or AISHE data aggregated across domains: `?format=json` (default) or `zip` (one CSV per table). */
  @Get('accreditation/:framework')
  @RequireFeature('analytics.accreditation')
  @Auth('user', MGMT)
  async accreditation(@CurrentPrincipal() p: UserPrincipal, @Param('framework') framework: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    if (!FRAMEWORKS.includes(framework as Framework)) throw new NotFoundException(`Unknown framework; use ${FRAMEWORKS.join(', ')}`);
    const { format, ...rest } = q;
    if (format && format !== 'json' && format !== 'zip') throw new BadRequestException('format must be json or zip');
    const params = parseParams(rest);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { pack } = await this.reports.pack(tx, framework as Framework, params);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.accreditation_exported', subjectType: 'report', data: { framework, format: format ?? 'json', period: pack.period, tables: pack.tables.length } });
      if (format !== 'zip') return pack;
      const out = this.reports.packZip(pack);
      res.setHeader('Content-Type', out.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(out.body);
    });
  }
}
