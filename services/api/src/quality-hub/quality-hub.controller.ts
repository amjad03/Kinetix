import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put, Query, Res } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { moduleSettings } from '../db/schema-quality-hub.js';
import { RECORDS, isRecordEntity, stepStates, type RecordDef } from './records.catalogue.js';
import { headerOf, normalise, reportPdf, reportXlsx } from './report-files.js';
import { REPORTS, isReportId, reportQuery, type ReportDef } from './reports.catalogue.js';
import { QUALITY_MODULES, SETTINGS_CATALOGUE, SettingsBody, effectiveSettings, settingsProblems, type ModuleSettings, type QualityModule } from './settings.catalogue.js';

/** Who may read a module's settings: the leadership and each module's owner. */
const SETTINGS_READ: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod', 'placement_officer', 'research_coordinator', 'grievance_officer'];
/** Who may change them. */
const SETTINGS_WRITE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const STAFF: RoleName[] = [...new Set([...SETTINGS_READ, 'accountant', 'hr_manager', 'icc_member'] as RoleName[])];

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d));
const has = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));
type Row = Record<string, unknown>;

/** `:id` in a fixed SQL fragment, bound as a uuid parameter. */
const bindId = (text: string, id: string): SQL => sql.join(text.split(':id').map((part) => sql.raw(part)), sql`${id}::uuid`);

/**
 * The quality, outcomes and engagement hub (docs/product/ERP_UI_PATTERNS.md): module settings, a
 * read model for record pages (facts, related lists, workflow position, audit history) and the
 * group's reports as JSON, XLSX and PDF. Each module keeps its own endpoints for changes.
 */
@Controller('v1/quality-hub')
export class QualityHubController {
  constructor(private readonly db: DbService) {}

  // ---- settings ---------------------------------------------------------------------------------

  @Get('settings')
  @Auth('user', SETTINGS_READ)
  modules() {
    return QUALITY_MODULES.map((m) => ({ module: m, catalogue: SETTINGS_CATALOGUE[m] }));
  }

  @Get('settings/:module')
  @Auth('user', SETTINGS_READ)
  getSettings(@CurrentPrincipal() p: UserPrincipal, @Param('module') m: string) {
    const mod = this.module(m);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = (await tx.execute<{ settings: Partial<ModuleSettings>; updated_at: Date; updated_by: string | null }>(sql`select settings, updated_at, (select full_name from users x where x.id = s.updated_by) as updated_by from module_settings s where module = ${mod}`)).rows;
      return { module: mod, catalogue: SETTINGS_CATALOGUE[mod], settings: effectiveSettings(mod, row?.settings ?? null), updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null, canEdit: has(p, SETTINGS_WRITE) };
    });
  }

  @Put('settings/:module')
  @Auth('user', SETTINGS_WRITE)
  putSettings(@CurrentPrincipal() p: UserPrincipal, @Param('module') m: string, @Body(new ZodBody(SettingsBody)) b: ModuleSettings) {
    const mod = this.module(m);
    const problems = settingsProblems(mod, b);
    if (problems.length) throw new BadRequestException(problems.join('; '));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = (await tx.execute<{ settings: Partial<ModuleSettings> }>(sql`select settings from module_settings where module = ${mod}`)).rows[0]?.settings ?? null;
      await tx
        .insert(moduleSettings)
        .values({ tenantId: p.tenantId, module: mod, settings: b, updatedBy: p.userId })
        .onConflictDoUpdate({ target: [moduleSettings.tenantId, moduleSettings.module], set: { settings: b, updatedBy: p.userId, updatedAt: new Date() } });
      const changed = (['numbering', 'rules', 'templates', 'defaults'] as const).filter((g) => JSON.stringify(effectiveSettings(mod, before)[g]) !== JSON.stringify(effectiveSettings(mod, b)[g]));
      await auditUser(tx, p, 'module_settings.updated', 'module_settings', undefined, { module: mod, changed });
      return { module: mod, settings: effectiveSettings(mod, b) };
    });
  }

  // ---- record pages -----------------------------------------------------------------------------

  @Get('records/:entity/:id')
  @Auth('user', STAFF)
  record(@CurrentPrincipal() p: UserPrincipal, @Param('entity') entity: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!isRecordEntity(entity)) throw new NotFoundException('Record type not found');
    const def: RecordDef = RECORDS[entity];
    if (!has(p, def.roles)) throw new NotFoundException('Record not found');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const restricted = def.restrictedWhen ? `, (${def.restrictedWhen.sql}) as _restricted` : '';
      const cols = [`${def.title} as _title`, 'r.status::text as _status', 'r.created_at as _created', ...def.facts.map(([k, e]) => `${e} as "f_${k}"`), ...def.body.map(([k, e]) => `${e} as "b_${k}"`)].join(', ');
      const [row] = (await tx.execute<Row>(sql`select ${sql.raw(cols + restricted)} from ${sql.raw(`${def.table} r ${def.joins ?? ''}`)} where r.id = ${id}::uuid`)).rows;
      if (!row) throw new NotFoundException('Record not found');
      if (def.restrictedWhen && row._restricted && !has(p, def.restrictedWhen.roles)) throw new NotFoundException('Record not found');
      const related = [];
      for (const r of def.related) {
        const rows = (await tx.execute<Row>(bindId(r.sql, id))).rows;
        related.push({ key: r.key, columns: r.columns, rows: rows.map((x) => ({ id: String(x.id), ...Object.fromEntries(r.columns.map(([k, kind]) => [k, normalise(x[k], kind)])) })) });
      }
      const activity = (
        await tx.execute<{ id: number; action: string; at: Date; data: unknown; actor: string | null }>(
          sql`select a.id, a.action, a.at, a.data, (select full_name from users x where x.id = a.actor_id) as actor from audit_log a where a.subject_id = ${id}::uuid order by a.at desc, a.id desc limit 100`,
        )
      ).rows;
      const status = String(row._status);
      return {
        entity,
        id,
        module: def.module,
        title: String(row._title ?? ''),
        status,
        createdAt: normalise(row._created, 'datetime'),
        facts: def.facts.map(([k, , kind]) => ({ key: k, kind, value: normalise(row[`f_${k}`], kind) })),
        body: def.body.map(([k]) => ({ key: k, value: row[`b_${k}`] === null || row[`b_${k}`] === undefined ? null : String(row[`b_${k}`]) })).filter((x) => x.value),
        steps: stepStates(def, status),
        related,
        activity: activity.map((a) => ({ id: String(a.id), action: a.action, at: normalise(a.at, 'datetime'), actor: a.actor ?? 'System', data: a.data })),
      };
    });
  }

  // ---- reports ----------------------------------------------------------------------------------

  @Get('reports')
  @Auth('user', STAFF)
  reports(@CurrentPrincipal() p: UserPrincipal) {
    return Object.entries(REPORTS as Record<string, ReportDef>)
      .filter(([, d]) => has(p, d.roles))
      .map(([id, d]) => ({ id, module: d.module, criterion: d.criterion ?? null, columns: d.columns, statuses: d.statuses ?? [], entity: d.entity ?? null }));
  }

  @Get('reports/:id')
  @Auth('user', STAFF)
  async report(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id') rid: string,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('format') format = 'json',
  ) {
    if (!isReportId(rid)) throw new NotFoundException('Report not found');
    const def: ReportDef = REPORTS[rid];
    if (!has(p, def.roles)) throw new NotFoundException('Report not found');
    for (const d of [from, to]) if (d && !Day.safeParse(d).success) throw new BadRequestException('Dates are YYYY-MM-DD');
    if (from && to && from > to) throw new BadRequestException('The period starts after it ends');
    if (!['json', 'xlsx', 'pdf'].includes(format)) throw new BadRequestException('format is json, xlsx or pdf');
    const { rows, institution } = await this.db.withTenant(p.tenantId, async (tx) => {
      const raw = (await tx.execute<Row>(reportQuery(rid, { from, to, status }))).rows;
      const [t] = (await tx.execute<{ name: string }>(sql`select name from tenants limit 1`)).rows;
      if (format !== 'json') await auditUser(tx, p, 'report.exported', 'report', undefined, { report: rid, format, from: from ?? null, to: to ?? null, status: status ?? null });
      return { rows: raw.map((x, i) => ({ id: x.id ? String(x.id) : `${rid}-${i}`, ...Object.fromEntries(def.columns.map(([k, kind]) => [k, normalise(x[k], kind)])) })), institution: t?.name ?? '' };
    });
    if (format === 'json') return { id: rid, module: def.module, criterion: def.criterion ?? null, columns: def.columns, statuses: def.statuses ?? [], entity: def.entity ?? null, rows };
    const title = headerOf(rid.replace('.', ' '));
    const filters = [from && `From ${from}`, to && `to ${to}`, status && `Status ${status}`].filter(Boolean).join(' ') || 'All records';
    const buf = format === 'xlsx' ? reportXlsx(title, def.columns, rows) : reportPdf({ title, institution, filters, criterion: def.criterion, columns: def.columns, rows });
    const type = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    res.set({ 'content-type': type, 'content-disposition': `attachment; filename="${rid}.${format}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    res.end(buf);
    return undefined;
  }

  private module(m: string): QualityModule {
    if (!(QUALITY_MODULES as readonly string[]).includes(m)) throw new NotFoundException('Module not found');
    return m as QualityModule;
  }
}
