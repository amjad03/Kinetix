import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import { PdfWriter, toCsv } from '../common/pdf.js';
import { writeXlsx } from '../common/xlsx.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { docCounters, libraryBooks, libraryStockCheckItems, libraryStockChecks, moduleSettings } from '../db/schema.js';
import { hasRole } from '../placements/placements.access.js';
import { DEFAULTS, MODULE_ROLES, NUMBERING, OPS_MODULES, RECORD_KINDS, REPORTS, type OpsModule } from './catalog.js';
import { defaultSeries, mergeSettings, SeriesBody, type Series } from './settings.js';

const ANY_OPS: RoleName[] = [...new Set(Object.values(MODULE_ROLES).flat())];
const Value = z.union([z.number(), z.boolean(), z.string().max(2000)]);
const SettingsBody = z.object({
  rules: z.record(z.string(), Value).default({}),
  templates: z.record(z.string(), z.string().max(2000)).default({}),
  defaults: z.record(z.string(), Value).default({}),
  numbering: z.record(z.string(), SeriesBody).default({}),
});
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ReportQuery = z.object({ from: Day.optional(), to: Day.optional(), status: z.string().trim().min(1).max(40).optional(), format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json') });
const ScanBody = z.object({ code: z.string().trim().min(1).max(80) });
const StartBody = z.object({ note: z.string().trim().max(300).default('') });
const SECRET = /hash|token|secret|password/i;

function moduleOf(m: string): OpsModule {
  if (!(OPS_MODULES as readonly string[]).includes(m)) throw new NotFoundException('Unknown module');
  return m as OpsModule;
}
function allow(p: UserPrincipal, m: OpsModule) {
  if (!hasRole(p, MODULE_ROLES[m])) throw new ForbiddenException('This module is not part of your role');
}
/** Rejects keys the catalogue does not know and values of the wrong type. */
function checkShape(m: OpsModule, b: z.infer<typeof SettingsBody>) {
  for (const part of ['rules', 'templates', 'defaults'] as const) {
    for (const [k, v] of Object.entries(b[part])) {
      const def = (DEFAULTS[m][part] as Record<string, unknown>)[k];
      if (def === undefined) throw new BadRequestException(`Unknown setting ${part}.${k}`);
      if (typeof def !== typeof v) throw new BadRequestException(`${part}.${k} must be a ${typeof def}`);
    }
  }
  for (const k of Object.keys(b.numbering)) if (!NUMBERING[m].includes(k)) throw new BadRequestException(`Unknown numbering series ${k}`);
}
/** A catalogue query with `$1..$3` bound as parameters (the SQL text itself is fixed in the catalogue). */
function bind(text: string, params: (string | null)[]): SQL {
  const parts = text.split(/\$([123])/);
  return sql.join(parts.map((part, i) => (i % 2 ? sql`${params[Number(part) - 1]}` : sql.raw(part))));
}
const clean = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET.test(k)));

/**
 * Depth layer for admissions and campus operations: module settings (rules, templates, defaults and numbering
 * series), one record view for every entity (row, related lists and audit history), registers and statements as
 * JSON / CSV / XLSX / PDF, and library stock verification.
 */
@Controller('v1')
export class CampusOpsController {
  constructor(private readonly db: DbService) {}

  @Get('module-settings/:module')
  @Auth('user', ANY_OPS)
  settings(@CurrentPrincipal() p: UserPrincipal, @Param('module') module: string) {
    const m = moduleOf(module);
    allow(p, m);
    return this.db.withTenant(p.tenantId, async (tx) => this.present(tx, p.tenantId, m));
  }

  @Put('module-settings/:module')
  @Auth('user', ANY_OPS)
  save(@CurrentPrincipal() p: UserPrincipal, @Param('module') module: string, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    const m = moduleOf(module);
    allow(p, m);
    checkShape(m, b);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.present(tx, p.tenantId, m);
      const settings = mergeSettings(m, { rules: { ...before.rules, ...b.rules }, templates: { ...before.templates, ...b.templates }, defaults: { ...before.defaults, ...b.defaults } });
      const numbering: Record<string, Series> = {};
      for (const k of NUMBERING[m]) {
        const s = b.numbering[k] ?? before.numbering[k];
        numbering[k] = { prefix: s.prefix, pad: s.pad, suffix: s.suffix ?? '' };
        // Moving the next number forward (never back, which would reissue numbers) resets the counter.
        const next = b.numbering[k]?.next;
        if (next !== undefined && next !== before.numbering[k].next) {
          if (next < before.numbering[k].next) throw new ConflictException(`${k} numbers up to ${before.numbering[k].next - 1} are already used`);
          await tx.insert(docCounters).values({ tenantId: p.tenantId, kind: k, lastNo: next - 1 }).onConflictDoUpdate({ target: [docCounters.tenantId, docCounters.kind], set: { lastNo: next - 1 } });
        }
      }
      await tx
        .insert(moduleSettings)
        .values({ tenantId: p.tenantId, module: m, settings, numbering, updatedBy: p.userId })
        .onConflictDoUpdate({ target: [moduleSettings.tenantId, moduleSettings.module], set: { settings, numbering, updatedBy: p.userId, updatedAt: new Date() } });
      await auditUser(tx, p, 'module_settings.saved', 'module_settings', undefined, { module: m, before, after: { ...settings, numbering } });
      return this.present(tx, p.tenantId, m);
    });
  }

  private async present(tx: Tx, tenantId: string, m: OpsModule) {
    const [row] = await tx.select().from(moduleSettings).where(and(eq(moduleSettings.tenantId, tenantId), eq(moduleSettings.module, m)));
    const counters = await tx.select().from(docCounters).where(eq(docCounters.tenantId, tenantId));
    const stored = (row?.numbering ?? {}) as Record<string, Series>;
    const numbering = Object.fromEntries(NUMBERING[m].map((k) => [k, { ...(stored[k] ?? defaultSeries(k)), next: (counters.find((c) => c.kind === k)?.lastNo ?? 0) + 1 }]));
    return { module: m, ...mergeSettings(m, row?.settings), numbering, updatedAt: row?.updatedAt ?? null };
  }

  @Get('ops-records/:kind/:id')
  @Auth('user', ANY_OPS)
  record(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string) {
    const k = RECORD_KINDS[kind];
    if (!k) throw new NotFoundException('Unknown record kind');
    allow(p, k.module);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = (await tx.execute<{ row: Record<string, unknown>; title: string | null }>(sql`select to_jsonb(r) as row, ${sql.raw(k.title)} as title from ${sql.identifier(k.table)} r where r.id = ${id}::uuid`)).rows;
      if (!rows[0]) throw new NotFoundException('Record not found');
      const related = [];
      for (const rel of k.related ?? []) {
        const order = rel.order ? sql` order by ${sql.identifier(rel.order)} desc nulls last` : sql``;
        const list = (await tx.execute<{ row: Record<string, unknown> }>(sql`select to_jsonb(x) as row from ${sql.identifier(rel.table)} x where ${sql.identifier(rel.fk)} = ${id}::uuid${order} limit 100`)).rows;
        const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(rel.table)} where ${sql.identifier(rel.fk)} = ${id}::uuid`)).rows;
        related.push({ key: rel.key, count: n, rows: list.map((r) => clean(r.row)) });
      }
      const activity = (
        await tx.execute<{ id: number; action: string; at: string; actor: string | null; data: unknown }>(
          sql`select a.id, a.action, a.at, u.full_name as actor, a.data from audit_log a left join users u on u.id = a.actor_id where a.subject_id = ${id}::uuid order by a.at desc limit 100`,
        )
      ).rows;
      return { kind, module: k.module, id, title: rows[0].title ?? id, record: clean(rows[0].row), related, activity };
    });
  }

  @Get('ops-reports')
  @Auth('user', ANY_OPS)
  reports(@CurrentPrincipal() p: UserPrincipal) {
    return Object.entries(REPORTS)
      .filter(([, r]) => hasRole(p, MODULE_ROLES[r.module]))
      .map(([id, r]) => ({ id, module: r.module, columns: r.columns.map(([key, label]) => ({ key, label })), filters: r.filters }));
  }

  @Get('ops-reports/:id')
  @Auth('user', ANY_OPS)
  async report(@CurrentPrincipal() p: UserPrincipal, @Param('id') reportId: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const def = REPORTS[reportId];
    if (!def) throw new NotFoundException('Unknown report');
    allow(p, def.module);
    const parsed = ReportQuery.safeParse(q);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid filters');
    const f = parsed.data;
    const use = (k: 'from' | 'to' | 'status') => (def.filters.includes(k) ? (f[k] ?? null) : null);
    const rows = await this.db.withTenant(p.tenantId, async (tx) => {
      const out = (await tx.execute<Record<string, unknown>>(bind(def.sql, [use('from'), use('to'), use('status')]))).rows;
      if (f.format !== 'json') await auditUser(tx, p, 'ops_report.exported', 'ops_report', undefined, { report: reportId, format: f.format, filters: { from: use('from'), to: use('to'), status: use('status') } });
      return out;
    });
    const grid = [def.columns.map(([, label]) => label), ...rows.map((r) => def.columns.map(([key]) => (r[key] === null || r[key] === undefined ? '' : (r[key] as string | number))))];
    const name = `${reportId.replace('.', '-')}`;
    const send = (type: string, ext: string, body: Buffer | string) => {
      res.setHeader('content-type', type);
      res.setHeader('content-disposition', `attachment; filename="${name}.${ext}"`);
      res.end(body);
    };
    if (f.format === 'csv') return send('text/csv; charset=utf-8', 'csv', toCsv(grid));
    if (f.format === 'xlsx') return send('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx', writeXlsx(def.module, grid.map((r) => r.map((c) => (c === '' ? null : typeof c === 'number' ? c : Number.isFinite(Number(c)) && c !== '' && /^-?\d+(\.\d+)?$/.test(String(c)) ? Number(c) : String(c))))));
    if (f.format === 'pdf') {
      const pdf = new PdfWriter();
      pdf.text(reportId, { size: 13, bold: true });
      pdf.text([use('from') && `From ${use('from')}`, use('to') && `to ${use('to')}`, use('status') && `Status ${use('status')}`].filter(Boolean).join(' ') || 'All records', { size: 8 });
      pdf.gap(6);
      const xs = def.columns.map((_, i) => Math.round((i * 515) / def.columns.length));
      pdf.row(grid[0].map(String), xs, { bold: true, size: 8 });
      pdf.rule();
      for (const r of grid.slice(1)) pdf.row(r.map(String), xs, { size: 8 });
      pdf.gap(6);
      pdf.text(`${rows.length} rows`, { size: 8 });
      return send('application/pdf', 'pdf', pdf.build());
    }
    res.json({ id: reportId, module: def.module, columns: def.columns.map(([key, label]) => ({ key, label })), rows });
  }

  // ---- library stock verification ----

  @Get('library/stock-checks')
  @Auth('user', MODULE_ROLES.library)
  checks(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(libraryStockChecks).orderBy(desc(libraryStockChecks.createdAt)).limit(50));
  }

  @Post('library/stock-checks')
  @Auth('user', MODULE_ROLES.library)
  start(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StartBody)) b: z.infer<typeof StartBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [open] = await tx.select({ id: libraryStockChecks.id }).from(libraryStockChecks).where(eq(libraryStockChecks.status, 'open'));
      if (open) throw new ConflictException('A stock verification is already open; close it first');
      const [row] = await tx.insert(libraryStockChecks).values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'LSC'), note: b.note, startedBy: p.userId }).returning();
      await auditUser(tx, p, 'library.stock_check.started', 'library_stock_check', row.id, { number: row.number });
      return row;
    });
  }

  /** Scans one copy by barcode, ISBN or book id; scanning the same title again counts another copy. */
  @Post('library/stock-checks/:id/scan')
  @HttpCode(200)
  @Auth('user', MODULE_ROLES.library)
  scan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScanBody)) b: z.infer<typeof ScanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const check = await this.openCheck(tx, id);
      const uuid = /^[0-9a-f-]{36}$/i.test(b.code) ? b.code : '00000000-0000-0000-0000-000000000000';
      const [book] = await tx.select().from(libraryBooks).where(sql`${libraryBooks.barcode} = ${b.code} or ${libraryBooks.isbn} = ${b.code} or ${libraryBooks.id} = ${uuid}::uuid`).limit(1);
      if (!book) throw new NotFoundException('No book has this code');
      const [item] = await tx
        .insert(libraryStockCheckItems)
        .values({ tenantId: p.tenantId, checkId: check.id, bookId: book.id, scannedBy: p.userId })
        .onConflictDoUpdate({ target: [libraryStockCheckItems.checkId, libraryStockCheckItems.bookId], set: { found: sql`${libraryStockCheckItems.found} + 1`, scannedAt: new Date() } })
        .returning();
      return { bookId: book.id, title: book.title, found: item.found, copies: book.copies, over: item.found > book.copies };
    });
  }

  /** Closes the verification: copies expected (on the register, less those on loan) against copies found. */
  @Post('library/stock-checks/:id/close')
  @HttpCode(200)
  @Auth('user', MODULE_ROLES.library)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const check = await this.openCheck(tx, id);
      const lines = (
        await tx.execute<{ bookId: string; title: string; expected: number; found: number }>(sql`
          select b.id as "bookId", b.title, (b.copies - count(l.id) filter (where l.returned_at is null))::int as expected, coalesce(max(i.found), 0)::int as found
          from library_books b left join library_loans l on l.book_id = b.id left join library_stock_check_items i on i.book_id = b.id and i.check_id = ${check.id}::uuid
          group by b.id order by b.title`)
      ).rows;
      const missing = lines.filter((l) => l.found < l.expected).map((l) => ({ ...l, short: l.expected - l.found }));
      const summary = { titles: lines.length, expected: lines.reduce((s, l) => s + Math.max(0, l.expected), 0), found: lines.reduce((s, l) => s + l.found, 0), missing: missing.slice(0, 500), missingTitles: missing.length };
      const [row] = await tx.update(libraryStockChecks).set({ status: 'closed', closedBy: p.userId, closedAt: new Date(), summary }).where(eq(libraryStockChecks.id, id)).returning();
      await auditUser(tx, p, 'library.stock_check.closed', 'library_stock_check', id, { expected: summary.expected, found: summary.found, missingTitles: summary.missingTitles });
      return row;
    });
  }

  private async openCheck(tx: Tx, id: string) {
    const [check] = await tx.select().from(libraryStockChecks).where(eq(libraryStockChecks.id, id)).for('update');
    if (!check) throw new NotFoundException('Stock verification not found');
    if (check.status !== 'open') throw new ConflictException(`This stock verification is ${check.status}`);
    return check;
  }
}
