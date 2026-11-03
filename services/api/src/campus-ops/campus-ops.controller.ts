import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
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
import { libraryCopies } from '../db/schema-lht.js';
import { libraryStockCheckCopies } from '../db/schema-library.js';
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
const StartBody = z.object({ note: z.string().trim().max(300).default(''), branchId: z.uuid().optional(), shelfPrefix: z.string().trim().max(40).default('') });
const CloseBody = z.object({ markMissing: z.boolean().default(false) }).default({ markMissing: false });
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
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ c: libraryStockChecks, scanned: sql<number>`(select count(*)::int from library_stock_check_copies s where s.check_id = ${libraryStockChecks.id})`, branch: sql<string | null>`(select name from library_branches b where b.id = ${libraryStockChecks.branchId})` })
        .from(libraryStockChecks)
        .orderBy(desc(libraryStockChecks.createdAt))
        .limit(50)
        .then((rows) => rows.map((r) => ({ ...r.c, scannedCopies: r.scanned, branchName: r.branch }))),
    );
  }

  /** Starts a verification of the whole library, one branch, or a shelf range (shelf marks starting with `shelfPrefix`). */
  @Post('library/stock-checks')
  @Auth('user', MODULE_ROLES.library)
  start(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StartBody)) b: z.infer<typeof StartBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [open] = await tx.select({ id: libraryStockChecks.id }).from(libraryStockChecks).where(eq(libraryStockChecks.status, 'open'));
      if (open) throw new ConflictException('A stock verification is already open; close it first');
      const [row] = await tx.insert(libraryStockChecks).values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'LSC'), note: b.note, branchId: b.branchId ?? null, shelfPrefix: b.shelfPrefix, startedBy: p.userId }).returning();
      await auditUser(tx, p, 'library.stock_check.started', 'library_stock_check', row.id, { number: row.number, branchId: b.branchId ?? null, shelfPrefix: b.shelfPrefix });
      return row;
    });
  }

  /**
   * Scans one copy by its barcode, accession number or RFID tag (each copy counts once, a second scan is reported as a
   * repeat). A book's own barcode or ISBN (catalogues from before the accession register) counts one more copy of it.
   */
  @Post('library/stock-checks/:id/scan')
  @HttpCode(200)
  @Auth('user', MODULE_ROLES.library)
  scan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScanBody)) b: z.infer<typeof ScanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const check = await this.openCheck(tx, id);
      const code = b.code.toLowerCase();
      const [copy] = await tx.select().from(libraryCopies).where(sql`lower(${libraryCopies.barcode}) = ${code} or lower(${libraryCopies.accessionNo}) = ${code} or lower(${libraryCopies.rfid}) = ${code}`).limit(1);
      if (copy) {
        const [book] = await tx.select({ id: libraryBooks.id, title: libraryBooks.title, copies: libraryBooks.copies }).from(libraryBooks).where(eq(libraryBooks.id, copy.bookId));
        const [seen] = await tx.insert(libraryStockCheckCopies).values({ tenantId: p.tenantId, checkId: check.id, copyId: copy.id, priorStatus: copy.status, scannedBy: p.userId }).onConflictDoNothing().returning({ id: libraryStockCheckCopies.id });
        const [{ found }] = await tx.select({ found: sql<number>`count(*)::int` }).from(libraryStockCheckCopies).innerJoin(libraryCopies, eq(libraryCopies.id, libraryStockCheckCopies.copyId)).where(and(eq(libraryStockCheckCopies.checkId, check.id), eq(libraryCopies.bookId, book.id)));
        // Out of place: another branch's copy, or a copy the register says is out or gone.
        const note = check.branchId && copy.branchId && copy.branchId !== check.branchId ? 'other_branch' : copy.status === 'on_loan' ? 'on_loan' : ['lost', 'withdrawn', 'missing'].includes(copy.status) ? copy.status : null;
        return { bookId: book.id, copyId: copy.id, accessionNo: copy.accessionNo, title: book.title, found, copies: book.copies, repeat: !seen, status: copy.status, note, over: false };
      }
      const uuid = /^[0-9a-f-]{36}$/i.test(b.code) ? b.code : '00000000-0000-0000-0000-000000000000';
      const [book] = await tx.select().from(libraryBooks).where(sql`${libraryBooks.barcode} = ${b.code} or ${libraryBooks.isbn} = ${b.code} or ${libraryBooks.id} = ${uuid}::uuid`).limit(1);
      if (!book) throw new NotFoundException('No copy or book has this code');
      const [item] = await tx
        .insert(libraryStockCheckItems)
        .values({ tenantId: p.tenantId, checkId: check.id, bookId: book.id, scannedBy: p.userId })
        .onConflictDoUpdate({ target: [libraryStockCheckItems.checkId, libraryStockCheckItems.bookId], set: { found: sql`${libraryStockCheckItems.found} + 1`, scannedAt: new Date() } })
        .returning();
      return { bookId: book.id, title: book.title, found: item.found, copies: book.copies, over: item.found > book.copies };
    });
  }

  /**
   * Closes the verification. Each copy in scope that should be on the shelf (on the shelf, missing or damaged in the
   * register) is found or not; copies out on loan, at the binder or in transit are accounted for elsewhere. With
   * `markMissing`, copies not found become "missing" and missing copies that were found go back on the shelf.
   */
  @Post('library/stock-checks/:id/close')
  @HttpCode(200)
  @Auth('user', MODULE_ROLES.library)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CloseBody)) b: z.infer<typeof CloseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const check = await this.openCheck(tx, id);
      const scope = sql`${check.branchId ? sql`and coalesce(c.at_branch_id, c.branch_id) = ${check.branchId}::uuid` : sql``} ${check.shelfPrefix ? sql`and c.shelf ilike ${`${check.shelfPrefix.replace(/[\\%_]/g, (x) => `\\${x}`)}%`}` : sql``}`;
      const copies = (
        await tx.execute<{ id: string; book_id: string; accession_no: string; title: string; status: string; price_paise: number; found: boolean }>(sql`
          select c.id, c.book_id, c.accession_no, b.title, c.status, c.price_paise, exists (select 1 from library_stock_check_copies s where s.check_id = ${check.id}::uuid and s.copy_id = c.id) as found
          from library_copies c join library_books b on b.id = c.book_id
          where c.status not in ('withdrawn', 'lost') ${scope}
          order by length(c.accession_no), c.accession_no`)
      ).rows;
      // Titles scanned by their own barcode before the register: their count stands in for copies of that title.
      const byTitle = new Map((await tx.select({ bookId: libraryStockCheckItems.bookId, found: libraryStockCheckItems.found }).from(libraryStockCheckItems).where(eq(libraryStockCheckItems.checkId, check.id))).map((r) => [r.bookId, r.found]));
      const shelfStatuses = ['available', 'missing', 'damaged'];
      const expected = copies.filter((c) => shelfStatuses.includes(c.status));
      const counted = new Map<string, number>();
      const missing = expected.filter((c) => {
        if (c.found) return false;
        const left = (byTitle.get(c.book_id) ?? 0) - (counted.get(c.book_id) ?? 0);
        if (left > 0) {
          counted.set(c.book_id, (counted.get(c.book_id) ?? 0) + 1);
          return false;
        }
        return true;
      });
      const foundAgain = copies.filter((c) => c.found && c.status === 'missing');
      if (b.markMissing) {
        if (missing.length) await tx.update(libraryCopies).set({ status: 'missing', note: `Not found in stock verification ${check.number}` }).where(and(inArray(libraryCopies.id, missing.map((c) => c.id)), eq(libraryCopies.status, 'available')));
        if (foundAgain.length) await tx.update(libraryCopies).set({ status: 'available', note: `Found in stock verification ${check.number}` }).where(inArray(libraryCopies.id, foundAgain.map((c) => c.id)));
      }
      const summary = {
        copies: copies.length,
        expected: expected.length,
        found: expected.length - missing.length,
        onLoan: copies.filter((c) => c.status === 'on_loan').length,
        atBinder: copies.filter((c) => c.status === 'binding').length,
        inTransit: copies.filter((c) => c.status === 'in_transit').length,
        missingCopies: missing.length,
        missingValuePaise: missing.reduce((s, c) => s + Number(c.price_paise), 0),
        foundAgain: foundAgain.length,
        markedMissing: b.markMissing,
        missing: missing.slice(0, 500).map((c) => ({ copyId: c.id, accessionNo: c.accession_no, title: c.title, bookId: c.book_id })),
        missingTitles: new Set(missing.map((c) => c.book_id)).size,
        titles: new Set(copies.map((c) => c.book_id)).size,
      };
      const [row] = await tx.update(libraryStockChecks).set({ status: 'closed', closedBy: p.userId, closedAt: new Date(), summary }).where(eq(libraryStockChecks.id, id)).returning();
      await auditUser(tx, p, 'library.stock_check.closed', 'library_stock_check', id, { expected: summary.expected, found: summary.found, missingCopies: summary.missingCopies, markedMissing: b.markMissing });
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
