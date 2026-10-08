import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { customReports } from '../db/schema.js';
import { reportSchedules } from '../db/schema-foundation.js';
import { RequireFeature } from '../flags/flags.js';
import type { ReportDef } from './catalogue.js';
import { AGGREGATES, assertMayUse, DATASETS, datasetByKey, datasetsFor, DefinitionSchema, OPERATORS, planOutputs, runCustomReport, type Dataset } from './custom-reports.js';
import { FREQUENCIES, nextRun, renderCsv, ReportsService } from './reports.service.js';

const MGMT: RoleName[] = ['tenant_admin', 'principal'];
/** Everyone who may use at least one dataset; each dataset then checks its own roles. */
const BUILDER_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher', 'accountant', 'hr_manager'];

const Name = z.string().trim().min(1).max(120);
const SaveBody = z.object({ name: Name, description: z.string().trim().max(500).default(''), dataset: z.string().min(1).max(40), definition: DefinitionSchema });
const PreviewBody = z.object({ dataset: z.string().min(1).max(40), definition: DefinitionSchema });
const RunBody = z.object({ format: z.enum(['json', 'csv']).default('json') });
const ScheduleBody = z.object({ frequency: z.enum(FREQUENCIES), recipients: z.array(z.email().max(200)).min(1).max(20) });

const dataset = (key: string): Dataset => datasetByKey(key) ?? (() => { throw new BadRequestException(`Unknown dataset; use ${DATASETS.map((d) => d.key).join(', ')}`); })();

/** Saved custom reports: pick a dataset, columns, filters, grouping and sort; run, export as CSV or schedule by email. */
@Controller('v1/analytics/custom-reports')
@RequireFeature('analytics.reports')
export class CustomReportsController {
  constructor(
    private readonly db: DbService,
    private readonly reports: ReportsService,
    private readonly clock: Clock,
  ) {}

  /** The datasets the caller may report on, with their columns. */
  @Get('datasets')
  @Auth('user', BUILDER_ROLES)
  datasets(@CurrentPrincipal() p: UserPrincipal) {
    return {
      operators: OPERATORS,
      aggregates: AGGREGATES,
      datasets: datasetsFor(p.roles).map((d) => ({ key: d.key, label: d.label, description: d.description, fields: d.fields.map(({ key, label, type }) => ({ key, label, type })) })),
    };
  }

  @Get()
  @Auth('user', BUILDER_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mgmt = p.roles.some((r) => MGMT.includes(r));
      const mine = await tx.select().from(customReports).where(mgmt ? undefined : eq(customReports.createdBy, p.userId)).orderBy(desc(customReports.updatedAt));
      const schedules = await tx.select().from(reportSchedules);
      return mine
        .filter((r) => datasetByKey(r.dataset)?.roles.some((x) => p.roles.includes(x)))
        .map((r) => ({ ...r, schedule: schedules.find((s) => s.reportKey === `custom.${r.id}`) ?? null }));
    });
  }

  /** Runs a definition without saving it. */
  @Post('preview')
  @HttpCode(200)
  @Auth('user', BUILDER_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>) {
    const ds = dataset(b.dataset);
    assertMayUse(ds, p.roles);
    return this.db.withTenant(p.tenantId, (tx) => runCustomReport(tx, p, ds, b.definition));
  }

  @Post()
  @Auth('user', BUILDER_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SaveBody)) b: z.infer<typeof SaveBody>) {
    const ds = dataset(b.dataset);
    assertMayUse(ds, p.roles);
    planOutputs(ds, b.definition);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(customReports).values({ tenantId: p.tenantId, name: b.name, description: b.description, dataset: b.dataset, definition: b.definition, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_created', subjectType: 'custom_report', subjectId: row.id, data: { name: b.name, dataset: b.dataset } });
      return row;
    });
  }

  @Put(':id')
  @Auth('user', BUILDER_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SaveBody)) b: z.infer<typeof SaveBody>) {
    const ds = dataset(b.dataset);
    assertMayUse(ds, p.roles);
    planOutputs(ds, b.definition);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.own(tx, p, id);
      const [row] = await tx.update(customReports).set({ name: b.name, description: b.description, dataset: b.dataset, definition: b.definition, updatedAt: new Date() }).where(eq(customReports.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_updated', subjectType: 'custom_report', subjectId: id, data: { name: b.name, dataset: b.dataset } });
      return row;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @Auth('user', BUILDER_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.own(tx, p, id);
      await tx.delete(reportSchedules).where(eq(reportSchedules.reportKey, `custom.${id}`));
      await tx.delete(customReports).where(eq(customReports.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_deleted', subjectType: 'custom_report', subjectId: id, data: { name: r.name } });
    });
  }

  /** Runs a saved report: JSON rows, or `{ "format": "csv" }` for a download. Every run is audited. */
  @Post(':id/run')
  @HttpCode(200)
  @Auth('user', BUILDER_ROLES)
  run(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RunBody)) b: z.infer<typeof RunBody>, @Res({ passthrough: true }) res: Response) {
    return this.execute(p, id, b.format, res);
  }

  /** The same as `run` with `?format=csv`, for a plain download link. */
  @Get(':id/export')
  @Auth('user', BUILDER_ROLES)
  export(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (format && format !== 'csv') throw new BadRequestException('format must be csv');
    return this.execute(p, id, 'csv', res);
  }

  private execute(p: UserPrincipal, id: string, format: 'json' | 'csv', res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.own(tx, p, id);
      const ds = dataset(r.dataset);
      const data = await runCustomReport(tx, p, ds, DefinitionSchema.parse(r.definition));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_run', subjectType: 'custom_report', subjectId: id, data: { dataset: r.dataset, format, rows: data.rows.length } });
      if (format === 'json') return { id, name: r.name, dataset: r.dataset, generatedAt: this.clock.now().toISOString(), ...data };
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="custom-report-${id.slice(0, 8)}.csv"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(renderCsv(data));
    });
  }

  /** Emails the report as CSV every day, week or month at 06:00 (the existing report scheduler runs it). */
  @Post(':id/schedule')
  @Auth('user', BUILDER_ROLES)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScheduleBody)) b: z.infer<typeof ScheduleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.own(tx, p, id);
      const ds = dataset(r.dataset);
      assertMayUse(ds, p.roles);
      const recipients = await this.reports.validateRecipients(tx, { roles: ds.roles } as ReportDef, b.recipients);
      const tz = await this.reports.tenantTimezone(tx);
      const key = `custom.${id}`;
      await tx.delete(reportSchedules).where(and(eq(reportSchedules.reportKey, key)));
      const [row] = await tx.insert(reportSchedules).values({ tenantId: p.tenantId, reportKey: key, params: {}, frequency: b.frequency, format: 'csv', recipients, nextRunAt: nextRun(this.clock.now(), b.frequency, tz), createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_created', subjectType: 'report_schedule', subjectId: row.id, data: { key, frequency: b.frequency, format: 'csv', recipients } });
      return row;
    });
  }

  @Delete(':id/schedule')
  @HttpCode(204)
  @Auth('user', BUILDER_ROLES)
  unschedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.own(tx, p, id);
      await tx.delete(reportSchedules).where(eq(reportSchedules.reportKey, `custom.${id}`));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_deleted', subjectType: 'custom_report', subjectId: id, data: { key: `custom.${id}` } });
    });
  }

  /** The caller's own report (leaders see everyone's). */
  private async own(tx: Tx, p: UserPrincipal, id: string) {
    const [r] = await tx.select().from(customReports).where(eq(customReports.id, id));
    if (!r || (r.createdBy !== p.userId && !p.roles.some((x) => MGMT.includes(x)))) throw new NotFoundException('Report not found');
    return r;
  }
}
