import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { customReports, reportDashboards, users, type DashboardWidget } from '../db/schema.js';
import { reportRuns, reportSchedules } from '../db/schema-foundation.js';
import { RequireFeature } from '../flags/flags.js';
import { AGGREGATES, BUCKETS, CHARTS, DefinitionSchema, fieldValues, FilterSchema, OPERATORS, RELATIVE, RELATIVE_WORDS, validateDefinition } from './engine.js';
import { compileExpr, ExprError, FUNCTIONS } from './expr.js';
import { LIBRARY_CATEGORIES, libraryFor, localizeDefinition } from './library.js';
import { EXPORT_FORMATS } from './render.js';
import { datasetsFor, fieldAggregatable, STUDIO_ROLES, type Lang } from './semantic.js';
import { FREQS, LangSchema, MGMT, nextStudioRun, RuntimeSchema, SourceSchema, StudioService } from './studio.service.js';

const isLeader = (roles: readonly RoleName[]) => roles.some((r) => MGMT.includes(r));
const Roles = z.array(z.string().regex(/^[a-z_]{3,40}$/)).max(30);
const RoleList = Roles.default([]);
const Name = z.string().trim().min(1).max(120);
const Folder = z.string().trim().max(60).default('');

const PreviewBody = z.object({ dataset: z.string().regex(/^[a-z_]{2,40}$/), definition: DefinitionSchema, runtime: RuntimeSchema, lang: LangSchema });
const RunBody = z.object({ runtime: RuntimeSchema, lang: LangSchema });
const FormulaBody = z.object({ dataset: z.string().regex(/^[a-z_]{2,40}$/), expr: z.string().min(1).max(400), kind: z.enum(['row', 'measure']).default('row'), definition: DefinitionSchema.optional() });
const DrillBody = z.object({ source: SourceSchema, runtime: RuntimeSchema, cell: z.array(z.object({ ref: z.string().regex(/^[a-z_][a-z0-9_]{0,39}(:(day|week|month|quarter|year|weekday))?$/), value: z.union([z.string().max(300), z.number(), z.boolean(), z.null()]) })).max(6), lang: LangSchema });
const ExportBody = z.object({ source: SourceSchema, runtime: RuntimeSchema, format: z.enum(EXPORT_FORMATS), lang: LangSchema });
const SaveBody = z.object({ name: Name, description: z.string().trim().max(500).default(''), folder: Folder, sharedRoles: RoleList, dataset: z.string().regex(/^[a-z_]{2,40}$/), definition: DefinitionSchema, sourceLibraryKey: z.string().regex(/^[a-z0-9_.]{3,80}$/).optional() });
const MetaBody = z.object({ name: Name.optional(), description: z.string().trim().max(500).optional(), folder: z.string().trim().max(60).optional(), sharedRoles: Roles.optional() }).refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change');
const FavouriteBody = z.object({ ref: z.string().regex(/^(custom:[0-9a-f-]{36}|lib:[a-z0-9_.]{3,80})$/), on: z.boolean() });
const FolderRename = z.object({ from: z.string().trim().min(1).max(60), to: z.string().trim().max(60) });
const Recipients = z.object({ emails: z.array(z.email().max(200)).max(30).default([]), userIds: z.array(z.uuid()).max(50).default([]), roles: RoleList });
const ScheduleBody = z.object({
  source: z.union([z.object({ reportId: z.uuid() }).strict(), z.object({ libraryKey: z.string().regex(/^[a-z0-9_.]{3,80}$/) }).strict()]),
  name: z.string().trim().max(120).default(''),
  frequency: z.enum(FREQS),
  hour: z.number().int().min(0).max(23).default(7),
  weekday: z.number().int().min(1).max(7).optional(),
  monthDay: z.number().int().min(1).max(28).optional(),
  format: z.enum(EXPORT_FORMATS).default('xlsx'),
  runtime: RuntimeSchema,
  lang: LangSchema,
  recipients: Recipients,
});
const SchedulePatch = z.object({ active: z.boolean().optional(), name: z.string().trim().max(120).optional(), frequency: z.enum(FREQS).optional(), hour: z.number().int().min(0).max(23).optional(), weekday: z.number().int().min(1).max(7).optional(), monthDay: z.number().int().min(1).max(28).optional(), format: z.enum(EXPORT_FORMATS).optional(), recipients: Recipients.optional(), runtime: z.array(FilterSchema).max(10).optional() }).refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change');
const Widget = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), ref: z.string().regex(/^(custom:[0-9a-f-]{36}|lib:[a-z0-9_.]{3,80})$/), title: z.string().trim().max(80).optional(), chart: z.enum(CHARTS).optional(), w: z.number().int().min(3).max(12).default(6), h: z.number().int().min(1).max(3).default(1) });
const DashboardBody = z.object({ name: Name, description: z.string().trim().max(500).default(''), widgets: z.array(Widget).max(24).default([]), sharedRoles: RoleList, defaultForRoles: RoleList });
const DataBody = z.object({ lang: LangSchema, period: z.enum(RELATIVE).optional() });

const lang = (q?: string): Lang => (q === 'hi' || q === 'kn' ? q : 'en');

/**
 * The report studio: a semantic catalogue, a builder whose definitions compile to safe SQL, a
 * library of ready-made reports, saved reports with folders, sharing and favourites, exports
 * (XLSX, CSV, PDF), drill-down, email schedules and dashboards.
 */
@Controller('v1/analytics/studio')
@RequireFeature('analytics.reports')
export class StudioController {
  constructor(
    private readonly db: DbService,
    private readonly studio: StudioService,
    private readonly clock: Clock,
  ) {}

  // ----- catalogue --------------------------------------------------------------------------------

  /** The datasets the caller may use, with the fields their role may see, and the builder's vocabulary. */
  @Get('catalogue')
  @Auth('user', STUDIO_ROLES)
  catalogue(@CurrentPrincipal() p: UserPrincipal, @Query('lang') l?: string) {
    const lg = lang(l);
    return {
      operators: OPERATORS,
      aggregates: AGGREGATES,
      buckets: BUCKETS,
      charts: CHARTS,
      relative: RELATIVE.map((k) => ({ key: k, label: RELATIVE_WORDS[k][lg] })),
      functions: FUNCTIONS,
      formats: EXPORT_FORMATS,
      datasets: datasetsFor(p.roles).map((d) => ({
        key: d.key,
        label: d.label[lg],
        description: d.description[lg],
        category: d.category,
        dateField: d.dateField ?? null,
        detail: d.detail,
        fields: this.studio.visibleFields(d, p.roles).map((f) => ({ key: f.key, label: f.label[lg], type: f.type, aggregatable: fieldAggregatable(f), picker: f.picker ?? null, restricted: !!f.roles })),
      })),
    };
  }

  /** Values of a field for filter pickers (record ids with names for classes, programs, departments…). */
  @Get('datasets/:key/values/:field')
  @Auth('user', STUDIO_ROLES)
  values(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string, @Param('field') field: string, @Query('q') q?: string, @Query('lang') l?: string) {
    if (!/^[a-z_][a-z0-9_]{0,39}$/.test(field)) throw new BadRequestException('Not a field');
    const ds = this.studio.dataset(key);
    return this.db.withTenant(p.tenantId, async (tx) => fieldValues(tx, ds, field, p, await this.studio.ctx(tx, lang(l)), q?.slice(0, 60)));
  }

  /** Checks a formula and returns its type, so the builder can say what is wrong as it is typed. */
  @Post('formula')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  formula(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FormulaBody)) b: z.infer<typeof FormulaBody>) {
    const ds = this.studio.dataset(b.dataset);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ctx = await this.studio.ctx(tx, 'en');
      // Earlier formulas of the definition are in scope.
      const plan = validateDefinition(ds, { ...(b.definition ?? DefinitionSchema.parse({})), columns: [], groupBy: [], aggregates: [], pivot: undefined, having: [], sort: [], filters: [] }, p, ctx);
      try {
        const out = compileExpr(b.expr, b.kind, (name) => {
          const r = plan.fields.get(name);
          if (!r || r.measure) return undefined;
          plan.field(name);
          return { sql: r.sql, type: r.type };
        }, ctx.today);
        return { ok: true, type: out.type };
      } catch (e) {
        if (e instanceof ExprError) return { ok: false, error: e.message };
        throw e;
      }
    });
  }

  // ----- running ----------------------------------------------------------------------------------

  /** Runs an unsaved definition (the builder's live preview). */
  @Post('preview')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { dataset: b.dataset, definition: b.definition }, b.lang);
      return this.studio.run(tx, r, p, b.lang, { runtime: b.runtime });
    });
  }

  /** The rows behind one cell of a summary: the same filters plus the cell's groupings. */
  @Post('drill')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  drill(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DrillBody)) b: z.infer<typeof DrillBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, b.source, b.lang);
      const allowed = new Set([...r.def.groupBy, ...(r.def.pivot ? [r.def.pivot.column] : [])]);
      for (const c of b.cell) if (!allowed.has(c.ref)) throw new BadRequestException(`"${c.ref}" is not a grouping of this report`);
      const visible = r.ds.detail.filter((k) => this.studio.visibleFields(r.ds, p.roles).some((f) => f.key === k));
      const def = { ...r.def, columns: visible, groupBy: [], aggregates: [], pivot: undefined, having: [], sort: [], totals: true, chart: undefined, formatting: [], limit: 2000 };
      return this.studio.run(tx, { ...r, def }, p, b.lang, { runtime: b.runtime, extra: b.cell });
    });
  }

  /** Downloads a report as XLSX, CSV or PDF with the institution's header. Audited. */
  @Post('export')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  export(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ExportBody)) b: z.infer<typeof ExportBody>, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, b.source, b.lang);
      const out = await this.studio.export(tx, p, r, b.format, b.lang, b.runtime);
      res.setHeader('Content-Type', out.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(out.body);
    });
  }

  // ----- library ----------------------------------------------------------------------------------

  @Get('library')
  @Auth('user', STUDIO_ROLES)
  library(@CurrentPrincipal() p: UserPrincipal, @Query('lang') l?: string) {
    const lg = lang(l);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fav = await this.studio.favourites(tx, p);
      const ds = Object.fromEntries(datasetsFor(p.roles).map((d) => [d.key, d.label[lg]]));
      return {
        categories: LIBRARY_CATEGORIES,
        reports: libraryFor(p.roles).map((x) => ({ key: x.key, category: x.category, dataset: x.dataset, datasetLabel: ds[x.dataset] ?? x.dataset, title: x.title[lg], description: x.description[lg], chart: x.definition.chart?.type ?? 'table', favourite: fav.has(`lib:${x.key}`) })),
      };
    });
  }

  @Get('library/:key')
  @Auth('user', STUDIO_ROLES)
  libraryReport(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string, @Query('lang') l?: string) {
    if (!/^[a-z0-9_.]{3,80}$/.test(key)) throw new BadRequestException('Unknown report');
    const lg = lang(l);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { libraryKey: key }, lg);
      const fav = await this.studio.favourites(tx, p);
      return { key, ref: r.ref, title: r.title, description: r.description, dataset: r.ds.key, definition: localizeDefinition(r.def, lg), favourite: fav.has(r.ref!), canEdit: false };
    });
  }

  @Post('library/:key/run')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  runLibrary(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string, @Body(new ZodBody(RunBody)) b: z.infer<typeof RunBody>) {
    if (!/^[a-z0-9_.]{3,80}$/.test(key)) throw new BadRequestException('Unknown report');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { libraryKey: key }, b.lang);
      const res = await this.studio.run(tx, r, p, b.lang, { runtime: b.runtime });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.studio_run', subjectType: 'report', data: { ref: r.ref, rows: res.rows.length } });
      return { title: r.title, generatedAt: this.clock.now().toISOString(), ...res };
    });
  }

  // ----- saved reports ----------------------------------------------------------------------------

  @Get('reports')
  @Auth('user', STUDIO_ROLES)
  reports(@CurrentPrincipal() p: UserPrincipal, @Query('lang') l?: string) {
    const lg = lang(l);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ r: customReports, owner: users.fullName }).from(customReports).leftJoin(users, eq(users.id, customReports.createdBy)).orderBy(desc(customReports.updatedAt));
      const fav = await this.studio.favourites(tx, p);
      const schedules = await tx.select({ key: reportSchedules.reportKey, active: reportSchedules.active }).from(reportSchedules).where(sql`${reportSchedules.reportKey} like 'custom.%'`);
      const labels = Object.fromEntries(datasetsFor(p.roles).map((d) => [d.key, d.label[lg]]));
      return rows
        .filter(({ r }) => this.studio.mayView(r, p))
        .map(({ r, owner }) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          dataset: r.dataset,
          datasetLabel: labels[r.dataset] ?? r.dataset,
          folder: r.folder,
          sharedRoles: r.sharedRoles,
          owner: owner ?? '',
          mine: r.createdBy === p.userId,
          canEdit: this.studio.mayEdit(r, p),
          favourite: fav.has(`custom:${r.id}`),
          schedules: schedules.filter((s) => s.key === `custom.${r.id}`).length,
          chart: (r.definition as { chart?: { type?: string } }).chart?.type ?? 'table',
          sourceLibraryKey: r.sourceLibraryKey,
          updatedAt: r.updatedAt,
          lastRunAt: r.lastRunAt,
        }));
    });
  }

  @Get('reports/:id')
  @Auth('user', STUDIO_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.viewable(tx, p, id);
      const fav = await this.studio.favourites(tx, p);
      return { ...r, ref: `custom:${r.id}`, definition: DefinitionSchema.parse(r.definition), favourite: fav.has(`custom:${r.id}`), canEdit: this.studio.mayEdit(r, p) };
    });
  }

  @Post('reports')
  @Auth('user', STUDIO_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SaveBody)) b: z.infer<typeof SaveBody>) {
    const ds = this.studio.dataset(b.dataset);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.studio.validate(tx, ds, b.definition, p);
      const sharedRoles = this.studio.checkShare(ds, b.definition, b.sharedRoles);
      const [row] = await tx.insert(customReports).values({ tenantId: p.tenantId, name: b.name, description: b.description, folder: b.folder, sharedRoles, dataset: b.dataset, definition: b.definition, sourceLibraryKey: b.sourceLibraryKey ?? null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_created', subjectType: 'custom_report', subjectId: row.id, data: { name: b.name, dataset: b.dataset, folder: b.folder, sharedRoles, from: b.sourceLibraryKey } });
      return row;
    });
  }

  @Put('reports/:id')
  @Auth('user', STUDIO_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SaveBody)) b: z.infer<typeof SaveBody>) {
    const ds = this.studio.dataset(b.dataset);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.studio.editable(tx, p, id);
      await this.studio.validate(tx, ds, b.definition, p);
      const sharedRoles = this.studio.checkShare(ds, b.definition, b.sharedRoles);
      const [row] = await tx.update(customReports).set({ name: b.name, description: b.description, folder: b.folder, sharedRoles, dataset: b.dataset, definition: b.definition, updatedAt: this.clock.now() }).where(eq(customReports.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_updated', subjectType: 'custom_report', subjectId: id, data: { name: b.name, dataset: b.dataset }, changes: before.name !== b.name ? { name: { before: before.name, after: b.name } } : undefined });
      return row;
    });
  }

  /** Rename, describe, move to a folder or share, without touching the definition. */
  @Patch('reports/:id')
  @Auth('user', STUDIO_ROLES)
  patch(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MetaBody)) b: z.infer<typeof MetaBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.studio.editable(tx, p, id);
      const sharedRoles = b.sharedRoles ? this.studio.checkShare(this.studio.dataset(before.dataset), DefinitionSchema.parse(before.definition), b.sharedRoles) : undefined;
      const set = { ...(b.name !== undefined ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description } : {}), ...(b.folder !== undefined ? { folder: b.folder } : {}), ...(sharedRoles ? { sharedRoles } : {}) };
      const [row] = await tx.update(customReports).set({ ...set, updatedAt: this.clock.now() }).where(eq(customReports.id, id)).returning();
      const changes = Object.fromEntries(Object.entries(set).map(([k, v]) => [k, { before: (before as Record<string, unknown>)[k], after: v }]));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_updated', subjectType: 'custom_report', subjectId: id, data: { name: row.name }, changes });
      return row;
    });
  }

  @Post('reports/:id/duplicate')
  @Auth('user', STUDIO_ROLES)
  duplicate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ name: Name.optional() }))) b: { name?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const src = await this.studio.viewable(tx, p, id);
      const [row] = await tx.insert(customReports).values({ tenantId: p.tenantId, name: b.name ?? `${src.name} (copy)`.slice(0, 120), description: src.description, folder: src.createdBy === p.userId ? src.folder : '', sharedRoles: [], dataset: src.dataset, definition: src.definition, sourceLibraryKey: src.sourceLibraryKey, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_created', subjectType: 'custom_report', subjectId: row.id, data: { name: row.name, dataset: row.dataset, copiedFrom: id } });
      return row;
    });
  }

  @Delete('reports/:id')
  @HttpCode(204)
  @Auth('user', STUDIO_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.editable(tx, p, id);
      await tx.delete(reportSchedules).where(eq(reportSchedules.reportKey, `custom.${id}`));
      await tx.execute(sql`delete from report_favourites where report_ref = ${`custom:${id}`}`);
      // Dashboards lose the widget rather than show a broken one.
      for (const d of await tx.select().from(reportDashboards)) {
        const widgets = (d.widgets as DashboardWidget[]).filter((w) => w.ref !== `custom:${id}`);
        if (widgets.length !== (d.widgets as DashboardWidget[]).length) await tx.update(reportDashboards).set({ widgets }).where(eq(reportDashboards.id, d.id));
      }
      await tx.delete(customReports).where(eq(customReports.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_deleted', subjectType: 'custom_report', subjectId: id, data: { name: r.name } });
    });
  }

  @Post('reports/:id/run')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  runSaved(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RunBody)) b: z.infer<typeof RunBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, { reportId: id }, b.lang);
      const res = await this.studio.run(tx, r, p, b.lang, { runtime: b.runtime });
      await tx.update(customReports).set({ lastRunAt: this.clock.now() }).where(eq(customReports.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.custom_run', subjectType: 'custom_report', subjectId: id, data: { dataset: r.ds.key, format: 'json', rows: res.rows.length } });
      return { id, title: r.title, generatedAt: this.clock.now().toISOString(), ...res };
    });
  }

  @Put('favourites')
  @HttpCode(204)
  @Auth('user', STUDIO_ROLES)
  favourite(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FavouriteBody)) b: z.infer<typeof FavouriteBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.studio.setFavourite(tx, p, b.ref, b.on));
  }

  /** The caller's folders and how many of their reports each holds. */
  @Get('folders')
  @Auth('user', STUDIO_ROLES)
  folders(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ folder: customReports.folder, n: sql<number>`count(*)::int` }).from(customReports).where(and(eq(customReports.createdBy, p.userId), sql`${customReports.folder} <> ''`)).groupBy(customReports.folder).orderBy(customReports.folder);
      return rows.map((r) => ({ name: r.folder, count: r.n }));
    });
  }

  /** Renames one of the caller's folders (an empty name takes the reports out of the folder). */
  @Post('folders/rename')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  renameFolder(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FolderRename)) b: z.infer<typeof FolderRename>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const moved = await tx.update(customReports).set({ folder: b.to }).where(and(eq(customReports.createdBy, p.userId), eq(customReports.folder, b.from))).returning({ id: customReports.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.folder_renamed', subjectType: 'custom_report', data: { from: b.from, to: b.to, reports: moved.length } });
      return { moved: moved.length };
    });
  }

  // ----- schedules --------------------------------------------------------------------------------

  /** People who can receive reports (staff with an email), for the recipient picker. */
  @Get('people')
  @Auth('user', STUDIO_ROLES)
  people(@CurrentPrincipal() p: UserPrincipal, @Query('q') q?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.studio.people(tx, (q ?? '').slice(0, 60)));
  }

  @Get('schedules')
  @Auth('user', STUDIO_ROLES)
  schedules(@CurrentPrincipal() p: UserPrincipal, @Query('lang') l?: string) {
    const lg = lang(l);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const list = await this.studio.orderedSchedules(tx, p);
      const out = [];
      for (const s of list) {
        let title = '';
        let ok = true;
        try {
          title = (await this.studio.resolveRef(tx, p, this.studio.refOfKey(s.reportKey), lg)).title;
        } catch {
          ok = false;
        }
        const tz = await this.studio.timezone(tx);
        const o = this.studio.options(s, tz);
        out.push({ id: s.id, ref: this.studio.refOfKey(s.reportKey), title, available: ok, name: s.name, frequency: s.frequency, hour: o.hour, weekday: o.weekday, monthDay: o.monthDay, lang: o.lang, runtime: o.runtime, format: s.format, recipients: { emails: s.recipients, userIds: s.recipientUserIds, roles: s.recipientRoles }, active: s.active, nextRunAt: s.nextRunAt, lastRunAt: s.lastRunAt, lastStatus: s.lastStatus, lastError: s.lastError, failureCount: s.failureCount, mine: s.createdBy === p.userId });
      }
      return out;
    });
  }

  @Post('schedules')
  @Auth('user', STUDIO_ROLES)
  createSchedule(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ScheduleBody)) b: z.infer<typeof ScheduleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.studio.resolve(tx, p, b.source, b.lang);
      // The runtime filters must be valid for the report.
      validateDefinition(r.ds, r.def, p, await this.studio.ctx(tx, b.lang));
      await this.studio.run(tx, r, p, b.lang, { runtime: b.runtime, limit: 1 });
      const people = await this.studio.resolveRecipients(tx, r.ds, r.def, b.recipients.emails, b.recipients.userIds, []);
      if (people.denied.length) throw new BadRequestException(`These people cannot receive this report (not an active user, or not allowed its data): ${people.denied.join(', ')}`);
      this.studio.checkShare(r.ds, r.def, b.recipients.roles);
      if (!b.recipients.emails.length && !b.recipients.userIds.length && !b.recipients.roles.length) throw new BadRequestException('Choose at least one recipient');
      const tz = await this.studio.timezone(tx);
      const options = { hour: b.hour, weekday: b.weekday ?? 1, monthDay: b.monthDay ?? 1, lang: b.lang, runtime: b.runtime };
      const [row] = await tx
        .insert(reportSchedules)
        .values({ tenantId: p.tenantId, reportKey: this.studio.scheduleKey(r), params: {}, name: b.name || r.title, frequency: b.frequency, format: b.format, recipients: [...new Set(b.recipients.emails.map((e) => e.toLowerCase()))], recipientUserIds: b.recipients.userIds, recipientRoles: b.recipients.roles, options, nextRunAt: nextStudioRun(this.clock.now(), b.frequency, tz, options), createdBy: p.userId })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_created', subjectType: 'report_schedule', subjectId: row.id, data: { ref: r.ref, frequency: b.frequency, format: b.format, recipients: b.recipients } });
      return row;
    });
  }

  @Patch('schedules/:id')
  @Auth('user', STUDIO_ROLES)
  updateSchedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SchedulePatch)) b: z.infer<typeof SchedulePatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.studio.ownSchedule(tx, p, id);
      const tz = await this.studio.timezone(tx);
      const prev = this.studio.options(s, tz);
      const r = await this.studio.resolveRef(tx, p, this.studio.refOfKey(s.reportKey), prev.lang ?? 'en');
      if (b.recipients) {
        const people = await this.studio.resolveRecipients(tx, r.ds, r.def, b.recipients.emails, b.recipients.userIds, []);
        if (people.denied.length) throw new BadRequestException(`These people cannot receive this report (not an active user, or not allowed its data): ${people.denied.join(', ')}`);
        this.studio.checkShare(r.ds, r.def, b.recipients.roles);
        if (!b.recipients.emails.length && !b.recipients.userIds.length && !b.recipients.roles.length) throw new BadRequestException('Choose at least one recipient');
      }
      if (b.runtime) await this.studio.run(tx, r, p, prev.lang ?? 'en', { runtime: b.runtime, limit: 1 });
      const options = { ...prev, ...(b.hour !== undefined ? { hour: b.hour } : {}), ...(b.weekday !== undefined ? { weekday: b.weekday } : {}), ...(b.monthDay !== undefined ? { monthDay: b.monthDay } : {}), ...(b.runtime ? { runtime: b.runtime } : {}) };
      const frequency = b.frequency ?? (s.frequency as (typeof FREQS)[number]);
      const timing = b.active || b.frequency || b.hour !== undefined || b.weekday !== undefined || b.monthDay !== undefined;
      const [row] = await tx
        .update(reportSchedules)
        .set({
          options,
          ...(b.active !== undefined ? { active: b.active, ...(b.active ? { failureCount: 0 } : {}) } : {}),
          ...(b.name !== undefined ? { name: b.name } : {}),
          ...(b.format ? { format: b.format } : {}),
          ...(b.frequency ? { frequency: b.frequency } : {}),
          ...(b.recipients ? { recipients: b.recipients.emails.map((e) => e.toLowerCase()), recipientUserIds: b.recipients.userIds, recipientRoles: b.recipients.roles } : {}),
          ...(timing ? { nextRunAt: nextStudioRun(this.clock.now(), frequency, tz, options) } : {}),
        })
        .where(eq(reportSchedules.id, id))
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_updated', subjectType: 'report_schedule', subjectId: id, data: b });
      return row;
    });
  }

  @Delete('schedules/:id')
  @HttpCode(204)
  @Auth('user', STUDIO_ROLES)
  deleteSchedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.studio.ownSchedule(tx, p, id);
      await tx.delete(reportSchedules).where(eq(reportSchedules.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.schedule_deleted', subjectType: 'report_schedule', subjectId: id, data: { key: s.reportKey } });
    });
  }

  /** Sends the report now (the schedule's next run is unchanged). */
  @Post('schedules/:id/run-now')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  async runNow(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, (tx) => this.studio.ownSchedule(tx, p, id));
    return this.studio.runSchedule(p.tenantId, id, { by: p.userId });
  }

  @Get('schedules/:id/runs')
  @Auth('user', STUDIO_ROLES)
  scheduleRuns(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.studio.ownSchedule(tx, p, id);
      return tx.select({ id: reportRuns.id, status: reportRuns.status, format: reportRuns.format, rowCount: reportRuns.rowCount, deliveredTo: reportRuns.deliveredTo, error: reportRuns.error, createdAt: reportRuns.createdAt, manual: sql<boolean>`${reportRuns.requestedBy} is not null` }).from(reportRuns).where(eq(reportRuns.scheduleId, id)).orderBy(desc(reportRuns.createdAt)).limit(50);
    });
  }

  // ----- dashboards -------------------------------------------------------------------------------

  @Get('dashboards')
  @Auth('user', STUDIO_ROLES)
  dashboards(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ d: reportDashboards, owner: users.fullName }).from(reportDashboards).leftJoin(users, eq(users.id, reportDashboards.createdBy)).orderBy(desc(reportDashboards.updatedAt));
      return rows.filter(({ d }) => this.studio.mayViewDashboard(d, p)).map(({ d, owner }) => ({ id: d.id, name: d.name, description: d.description, widgets: (d.widgets as DashboardWidget[]).length, sharedRoles: d.sharedRoles, defaultForRoles: d.defaultForRoles, owner: owner ?? '', mine: d.createdBy === p.userId, canEdit: d.createdBy === p.userId || isLeader(p.roles), updatedAt: d.updatedAt }));
    });
  }

  /** The home dashboard of the caller's role, or null. */
  @Get('dashboards/home')
  @Auth('user', STUDIO_ROLES)
  home(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.studio.home(tx, p);
      return { dashboard: d ? { id: d.id, name: d.name } : null };
    });
  }

  @Get('dashboards/:id')
  @Auth('user', STUDIO_ROLES)
  dashboard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.studio.dashboard(tx, p, id);
      return { ...d, canEdit: d.createdBy === p.userId || isLeader(p.roles), canSetDefault: isLeader(p.roles) };
    });
  }

  @Post('dashboards/:id/data')
  @HttpCode(200)
  @Auth('user', STUDIO_ROLES)
  dashboardData(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DataBody)) b: z.infer<typeof DataBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.studio.dashboard(tx, p, id);
      return { widgets: await this.studio.dashboardData(tx, p, d, b.lang, b.period) };
    });
  }

  @Post('dashboards')
  @Auth('user', STUDIO_ROLES)
  createDashboard(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DashboardBody)) b: z.infer<typeof DashboardBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.defaultForRoles.length && !isLeader(p.roles)) throw new ForbiddenException('Only the principal or an administrator can set a role’s home dashboard');
      await this.studio.checkWidgets(tx, p, b.widgets);
      const [row] = await tx.insert(reportDashboards).values({ tenantId: p.tenantId, name: b.name, description: b.description, widgets: b.widgets, sharedRoles: b.sharedRoles, defaultForRoles: b.defaultForRoles, createdBy: p.userId }).returning();
      await this.clearOtherDefaults(tx, row.id, b.defaultForRoles);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.dashboard_created', subjectType: 'report_dashboard', subjectId: row.id, data: { name: b.name, widgets: b.widgets.length, defaultForRoles: b.defaultForRoles } });
      return row;
    });
  }

  @Put('dashboards/:id')
  @Auth('user', STUDIO_ROLES)
  updateDashboard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DashboardBody)) b: z.infer<typeof DashboardBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.studio.dashboard(tx, p, id, true);
      const defaultsChanged = JSON.stringify([...b.defaultForRoles].sort()) !== JSON.stringify([...(before.defaultForRoles as string[])].sort());
      if (defaultsChanged && !isLeader(p.roles)) throw new ForbiddenException('Only the principal or an administrator can set a role’s home dashboard');
      // Widgets already there stay even if the editor cannot open them; new ones must be theirs to open.
      const added = b.widgets.filter((w) => !(before.widgets as DashboardWidget[]).some((x) => x.ref === w.ref));
      await this.studio.checkWidgets(tx, p, added);
      const [row] = await tx.update(reportDashboards).set({ name: b.name, description: b.description, widgets: b.widgets, sharedRoles: b.sharedRoles, defaultForRoles: b.defaultForRoles, updatedAt: this.clock.now() }).where(eq(reportDashboards.id, id)).returning();
      await this.clearOtherDefaults(tx, id, b.defaultForRoles);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.dashboard_updated', subjectType: 'report_dashboard', subjectId: id, data: { name: b.name, widgets: b.widgets.length, defaultForRoles: b.defaultForRoles } });
      return row;
    });
  }

  @Post('dashboards/:id/duplicate')
  @Auth('user', STUDIO_ROLES)
  duplicateDashboard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.studio.dashboard(tx, p, id);
      const [row] = await tx.insert(reportDashboards).values({ tenantId: p.tenantId, name: `${d.name} (copy)`.slice(0, 120), description: d.description, widgets: d.widgets, sharedRoles: [], defaultForRoles: [], createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.dashboard_created', subjectType: 'report_dashboard', subjectId: row.id, data: { name: row.name, copiedFrom: id } });
      return row;
    });
  }

  @Delete('dashboards/:id')
  @HttpCode(204)
  @Auth('user', STUDIO_ROLES)
  deleteDashboard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.studio.dashboard(tx, p, id, true);
      await tx.delete(reportDashboards).where(eq(reportDashboards.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.dashboard_deleted', subjectType: 'report_dashboard', subjectId: id, data: { name: d.name } });
    });
  }

  /** A role has one home dashboard: making this one the default takes the role off any other. */
  private async clearOtherDefaults(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], id: string, roles: string[]) {
    if (!roles.length) return;
    const others = (await tx.select().from(reportDashboards).where(sql`${reportDashboards.id} <> ${id}`)).filter((o) => (o.defaultForRoles as string[]).some((r) => roles.includes(r)));
    for (const o of others) await tx.update(reportDashboards).set({ defaultForRoles: (o.defaultForRoles as string[]).filter((r) => !roles.includes(r)) }).where(eq(reportDashboards.id, o.id));
  }
}

