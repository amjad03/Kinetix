import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { customReports } from '../db/schema.js';
import { reportSchedules } from '../db/schema-foundation.js';
import { RequireFeature } from '../flags/flags.js';
import { AGGREGATES, DefinitionSchema, OPERATORS } from './engine.js';
import { renderResultCsv } from './render.js';
import { datasetsFor, STUDIO_ROLES } from './semantic.js';
import { nextStudioRun, StudioService } from './studio.service.js';

const Name = z.string().trim().min(1).max(120);
const SaveBody = z.object({ name: Name, description: z.string().trim().max(500).default(''), dataset: z.string().min(1).max(40), definition: DefinitionSchema });
const PreviewBody = z.object({ dataset: z.string().min(1).max(40), definition: DefinitionSchema });
const RunBody = z.object({ format: z.enum(['json', 'csv']).default('json') });
const ScheduleBody = z.object({ frequency: z.enum(['daily', 'weekly', 'monthly']), recipients: z.array(z.email().max(200)).min(1).max(20) });

/**
 * The first version of the custom report API, kept for the clients that use it. It runs on the
 * report studio's engine and catalogue (studio.controller.ts has the full feature set).
 */
@Controller('v1/analytics/custom-reports')
@RequireFeature('analytics.reports')
export class CustomReportsController {
  constructor(
    private readonly db: DbService,
    private readonly studio: StudioService,
    private readonly clock: Clock,
  ) {}

  /** The datasets the caller may report on, with the columns their role may see. */
  @Get('datasets')
  @Auth('user', STUDIO_ROLES)
  datasets(@CurrentPrincipal() p: UserPrincipal) {
    return {
      operators: OPERATORS,
      aggregates: AGGREGATES,
      datasets: datasetsFor(p.roles).map((d) => ({ key: d.key, label: d.label.en, description: d.description.en, fields: this.studio.visibleFields(d, p.roles).map(({ key, label, type }) => ({ key, label: label.en, type })) })),
    };
  }

  @Get()
  @Auth('user', STUDIO_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(customReports).orderBy(desc(customReports.updatedAt));
      const schedules = await tx.select().from(reportSchedules);
      return rows.filter((r) => this.studio.mayView(r, p)).map((r) => ({ ...r, schedule: schedules.find((s) => s.reportKey === `custom.${r.id}`) ?? null }));
    });
  }

  /** Runs a definition without saving it. */
  @Post('preview')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.studio.run(tx, await this.studio.resolve(tx, p, { dataset: b.dataset, definition: b.definition }, 'en'), p, 'en'));
  }

  @Post()
  @Auth('user', STUDIO_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SaveBody)) b: z.infer<typeof SaveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { dataset: b.dataset, definition: b.definition }, 'en');
      await this.studio.validate(tx, r.ds, b.definition, p);
      const [row] = await tx.insert(customReports).values({ tenantId: p.tenantId, name: b.name, description: b.description, dataset: b.dataset, definition: b.definition, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_created', subjectType: 'custom_report', subjectId: row.id, data: { name: b.name, dataset: b.dataset } });
      return row;
    });
  }

  @Put(':id')
  @Auth('user', STUDIO_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SaveBody)) b: z.infer<typeof SaveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { dataset: b.dataset, definition: b.definition }, 'en');
      await this.studio.editable(tx, p, id);
      await this.studio.validate(tx, r.ds, b.definition, p);
      const [row] = await tx.update(customReports).set({ name: b.name, description: b.description, dataset: b.dataset, definition: b.definition, updatedAt: this.clock.now() }).where(eq(customReports.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_updated', subjectType: 'custom_report', subjectId: id, data: { name: b.name, dataset: b.dataset } });
      return row;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @Auth('user', STUDIO_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.editable(tx, p, id);
      await tx.delete(reportSchedules).where(eq(reportSchedules.reportKey, `custom.${id}`));
      await tx.delete(customReports).where(eq(customReports.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_deleted', subjectType: 'custom_report', subjectId: id, data: { name: r.name } });
    });
  }

  /** Runs a saved report: JSON rows, or `{ "format": "csv" }` for a download. Every run is audited. */
  @Post(':id/run')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  run(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RunBody)) b: z.infer<typeof RunBody>, @Res({ passthrough: true }) res: Response) {
    return this.execute(p, id, b.format, res);
  }

  /** The same as `run` with `?format=csv`, for a plain download link. */
  @Get(':id/export')
  @Auth('user', STUDIO_ROLES)
  export(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (format && format !== 'csv') throw new BadRequestException('format must be csv');
    return this.execute(p, id, 'csv', res);
  }

  private execute(p: UserPrincipal, id: string, format: 'json' | 'csv', res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { reportId: id }, 'en');
      const data = await this.studio.run(tx, r, p, 'en', format === 'csv' ? { limit: 50_000 } : {});
      await tx.update(customReports).set({ lastRunAt: this.clock.now() }).where(eq(customReports.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_run', subjectType: 'custom_report', subjectId: id, data: { dataset: r.ds.key, format, rows: data.rows.length } });
      if (format === 'json') return { ...data, id, name: r.title, dataset: r.ds.key, generatedAt: this.clock.now().toISOString() };
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="custom-report-${id.slice(0, 8)}.csv"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(renderResultCsv(data, 'en'));
    });
  }

  /** Emails the report as CSV every day, week or month at 06:00 (the report scheduler runs it). */
  @Post(':id/schedule')
  @Auth('user', STUDIO_ROLES)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScheduleBody)) b: z.infer<typeof ScheduleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { reportId: id }, 'en');
      if (!r.ds.roles.some((x) => p.roles.includes(x))) throw new BadRequestException('You may not use this report');
      const people = await this.studio.resolveRecipients(tx, r.ds, r.def, b.recipients, [], []);
      if (people.denied.length) throw new BadRequestException(`Not an active user allowed to see this report: ${people.denied.join(', ')}`);
      const key = `custom.${id}`;
      const tz = await this.studio.timezone(tx);
      const now = this.clock.now();
      const options = { hour: 6, weekday: new Date(now).getUTCDay() || 7, monthDay: Math.min(28, new Date(now).getUTCDate()), lang: 'en' as const, runtime: [] };
      await tx.delete(reportSchedules).where(eq(reportSchedules.reportKey, key));
      const [row] = await tx.insert(reportSchedules).values({ tenantId: p.tenantId, reportKey: key, params: {}, name: r.title, frequency: b.frequency, format: 'csv', recipients: people.emails, options, nextRunAt: nextStudioRun(now, b.frequency, tz, options), createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_created', subjectType: 'report_schedule', subjectId: row.id, data: { key, frequency: b.frequency, format: 'csv', recipients: people.emails } });
      return row;
    });
  }

  @Delete(':id/schedule')
  @HttpCode(204)
  @Auth('user', STUDIO_ROLES)
  unschedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.studio.editable(tx, p, id);
      await tx.delete(reportSchedules).where(eq(reportSchedules.reportKey, `custom.${id}`));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_deleted', subjectType: 'custom_report', subjectId: id, data: { key: `custom.${id}` } });
    });
  }
}
