import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { looksLikeXlsx, readXlsx, writeWorkbook, type WorkbookSheet } from '../common/xlsx.js';
import type { Tx } from '../db/db.service.js';
import { recordImports, type ImportRowValues } from '../db/schema.js';
import { decodeUtf8, headerKey, parseCsv } from '../import/csv.js';
import { errorRow, type RowResult, type RowStatus } from '../import/import.service.js';
import type { Outcome, Row as ImportRow } from '../import/row-helpers.js';
import type { ImportColumn, KitCtx, RecordEntity } from './entity.js';

/** Uploads: an Excel workbook or a UTF-8 CSV of at most 6 MB and 5,000 rows. */
export const MAX_IMPORT_BYTES = 6 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

const ROLLBACK = Symbol('rollback');

export type ImportTotals = Record<RowStatus | 'rows', number>;

export interface ImportBatchView {
  id: string;
  entity: string;
  fileName: string;
  mode: 'insert' | 'upsert';
  status: 'validated' | 'committed' | 'failed';
  /** The file's columns that matched the template, by key. */
  columns: string[];
  /** Columns in the file the template does not know (ignored). */
  ignored: string[];
  totals: ImportTotals;
  /** One result per row: what would happen (preview) or what happened (after commit). */
  rows: (RowResult & { values: Record<string, string> })[];
  createdAt: string;
  committedAt: string | null;
}

/**
 * Runs `fn` for each row in its own savepoint and reports each one: a row that fails is rolled back alone and
 * the next row is still checked. Use it in an entity's `import.run`.
 */
export async function eachRow(tx: Tx, rows: ImportRow[], fn: (sp: Tx, row: ImportRow) => Promise<Outcome>): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (const r of rows) {
    try {
      out.push({ row: r.line, ...(await tx.transaction((sp) => fn(sp, r))) });
    } catch (e) {
      out.push(errorRow(r.line, e));
    }
  }
  return out;
}

const columnsOf = (e: RecordEntity): ImportColumn[] => {
  if (!e.import) throw new NotFoundException('This list has no import');
  return e.import.columns;
};

/** The Excel template: the data sheet (headers, an example row, drop-downs), a sheet that explains each column, and the hidden lists. */
export async function importTemplate(ctx: KitCtx, e: RecordEntity): Promise<Buffer> {
  const cols = columnsOf(e);
  const lists: string[][] = [];
  const validations: WorkbookSheet['lists'] = [];
  for (const [i, c] of cols.entries()) {
    const values = typeof c.options === 'function' ? await c.options(ctx) : c.options;
    if (!values?.length) continue;
    const at = lists.length;
    lists.push([c.header, ...values]);
    const letter = String.fromCharCode(65 + at);
    validations.push({ column: i, source: `Lists!$${letter}$2:$${letter}$${values.length + 1}`, prompt: c.help });
  }
  const listRows: (string | null)[][] = [];
  const height = Math.max(0, ...lists.map((l) => l.length));
  for (let r = 0; r < height; r++) listRows.push(lists.map((l) => l[r] ?? null));
  const sheets: WorkbookSheet[] = [
    {
      name: 'Data',
      header: true,
      rows: [cols.map((c) => (c.required ? `${c.header} *` : c.header)), cols.map((c) => c.example ?? '')],
      widths: cols.map((c) => Math.min(40, Math.max(12, c.header.length + 4, (c.example ?? '').length + 2))),
      lists: validations,
    },
    {
      name: 'Instructions',
      header: true,
      widths: [24, 10, 70, 40],
      rows: [
        ['Column', 'Required', 'What to enter', 'Allowed values'],
        ...cols.map((c, i) => [c.header, c.required ? 'Yes' : 'No', c.help ?? '', validations.some((v) => v.column === i) ? 'Choose from the drop-down' : '']),
        [],
        ['Rows are matched on', e.import!.key.map((k) => cols.find((c) => c.key === k)?.header ?? k).join(' + '), 'In "Update existing" mode a matching row updates the record; in "Add only" mode it is reported as an error.', ''],
        ['Example row', '', 'The second row of the Data sheet is an example. Type over it or leave it: an unchanged example row is not imported.', ''],
      ],
    },
  ];
  if (lists.length) sheets.push({ name: 'Lists', header: true, rows: listRows, hidden: true });
  return writeWorkbook(sheets);
}

/** Reads an upload into rows keyed by template column. Unknown columns are ignored; missing required ones refuse the file. */
export function parseUpload(e: RecordEntity, bytes: Buffer): { columns: string[]; ignored: string[]; rows: ImportRowValues[] } {
  const cols = columnsOf(e);
  let table: { line: number; cells: string[] }[];
  if (looksLikeXlsx(bytes)) {
    try {
      table = readXlsx(bytes).map((cells, i) => ({ line: i + 1, cells: cells.map((c) => c.trim()) }));
    } catch {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'IMPORT_BAD_FILE', message: 'This file could not be read. Upload the Excel template or a CSV file.' });
    }
    table = table.filter((r) => r.cells.some((c) => c !== ''));
  } else {
    const text = decodeUtf8(bytes);
    if (text === null) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'IMPORT_NOT_UTF8', message: 'The file is not UTF-8 text. Save it as "CSV UTF-8" or upload the Excel template.' });
    table = parseCsv(text);
  }
  if (table.length < 2) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'IMPORT_EMPTY', message: 'The file has no rows to import' });
  if (table.length - 1 > MAX_IMPORT_ROWS) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'IMPORT_TOO_MANY_ROWS', message: `The file has too many rows. Split it into files of at most ${MAX_IMPORT_ROWS} rows.` });
  const byHeader = new Map<string, string>();
  for (const c of cols) {
    byHeader.set(headerKey(c.key), c.key);
    byHeader.set(headerKey(c.header), c.key);
  }
  const headerKeys = table[0].cells.map((h) => byHeader.get(headerKey(h)) ?? null);
  const columns = [...new Set(headerKeys.filter((k): k is string => !!k))];
  const ignored = table[0].cells.filter((h, i) => h && !headerKeys[i]);
  const missing = cols.filter((c) => c.required && !columns.includes(c.key));
  if (missing.length) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'IMPORT_MISSING_COLUMNS', message: 'Some required columns are missing', missing: missing.map((c) => c.header) });
  const isExample = (values: Record<string, string>) => cols.some((c) => c.example) && cols.every((c) => (values[c.key] ?? '') === (c.example ?? ''));
  const rows = table
    .slice(1)
    .map((r) => {
      const values: Record<string, string> = {};
      headerKeys.forEach((k, i) => {
        if (k && !(k in values && values[k])) values[k] = r.cells[i] ?? '';
      });
      return { line: r.line, values };
    })
    // The template's own example row, left in by mistake, is not imported.
    .filter((r) => !isExample(r.values));
  if (!rows.length) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'IMPORT_EMPTY', message: 'The file has no rows to import' });
  return { columns, ignored, rows };
}

const asRow = (r: ImportRowValues): ImportRow => ({ line: r.line, get: (k: string) => (r.values[k] ?? '').trim() });

/** Runs every row (insert mode first refuses rows whose key already exists). */
async function runRows(ctx: KitCtx, e: RecordEntity, rows: ImportRowValues[], mode: 'insert' | 'upsert'): Promise<RowResult[]> {
  const spec = e.import!;
  const todo: ImportRow[] = [];
  const refused: RowResult[] = [];
  for (const r of rows.map(asRow)) {
    if (mode === 'insert' && (await spec.exists(ctx, r))) refused.push({ row: r.line, status: 'error', message: 'A record with this key already exists', code: 'IMPORT_EXISTS', detail: spec.key.map((k) => r.get(k)).join(' · ') });
    else todo.push(r);
  }
  const done = todo.length ? await spec.run(ctx, todo) : [];
  return [...refused, ...done].sort((a, b) => a.row - b.row);
}

function totalsOf(results: RowResult[]): ImportTotals {
  const t: ImportTotals = { rows: results.length, created: 0, updated: 0, skipped: 0, error: 0 };
  for (const r of results) t[r.status]++;
  return t;
}

function view(b: typeof recordImports.$inferSelect, columns?: string[], ignored: string[] = []): ImportBatchView {
  const results = ((b.result ?? b.preview) as RowResult[]) ?? [];
  const values = new Map(b.rows.map((r) => [r.line, r.values]));
  return {
    id: b.id,
    entity: b.entity,
    fileName: b.fileName,
    mode: b.mode,
    status: b.status,
    columns: columns ?? b.headers,
    ignored,
    totals: b.totals as ImportTotals,
    rows: results.map((r) => ({ ...r, values: values.get(r.row) ?? {} })),
    createdAt: b.createdAt.toISOString(),
    committedAt: b.committedAt?.toISOString() ?? null,
  };
}

/** Upload → parse → check every row without saving → keep the batch with its preview. */
export async function validateImport(ctx: KitCtx, e: RecordEntity, file: { name: string; bytes: Buffer }, mode: 'insert' | 'upsert'): Promise<ImportBatchView> {
  const parsed = parseUpload(e, file.bytes);
  let results: RowResult[] = [];
  try {
    await ctx.tx.transaction(async (sp) => {
      results = await runRows({ tx: sp, p: ctx.p }, e, parsed.rows, mode);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  const [b] = await ctx.tx
    .insert(recordImports)
    .values({ tenantId: ctx.p.tenantId, entity: e.key, fileName: file.name.slice(0, 200) || 'upload', mode, headers: parsed.columns, rows: parsed.rows, preview: results, totals: totalsOf(results), createdBy: ctx.p.userId })
    .returning();
  return view(b, parsed.columns, parsed.ignored);
}

export async function importBatch(ctx: KitCtx, e: RecordEntity, id: string): Promise<typeof recordImports.$inferSelect> {
  const [b] = await ctx.tx.select().from(recordImports).where(and(eq(recordImports.id, id), eq(recordImports.entity, e.key)));
  if (!b) throw new NotFoundException('Not found');
  return b;
}

export async function getImport(ctx: KitCtx, e: RecordEntity, id: string): Promise<ImportBatchView> {
  return view(await importBatch(ctx, e, id));
}

/**
 * Commits a checked batch from its stored rows. Rows are checked again (the data may have changed since the preview).
 * With errors, nothing is saved unless `skipErrors`, which saves the good rows and reports the bad ones.
 */
export async function commitImport(ctx: KitCtx, e: RecordEntity, id: string, skipErrors: boolean): Promise<ImportBatchView & { committed: boolean }> {
  const b = await importBatch(ctx, e, id);
  if (b.status === 'committed') throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'IMPORT_ALREADY_COMMITTED', message: 'This file has already been imported' });
  let results: RowResult[] = [];
  let committed = false;
  try {
    await ctx.tx.transaction(async (sp) => {
      results = await runRows({ tx: sp, p: ctx.p }, e, b.rows, b.mode);
      const errors = results.some((r) => r.status === 'error');
      if (errors && !skipErrors) throw ROLLBACK;
      committed = results.some((r) => r.status !== 'error');
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  const totals = totalsOf(results);
  const [saved] = await ctx.tx
    .update(recordImports)
    .set(committed ? { status: 'committed', result: results, totals, committedAt: new Date() } : { preview: results, totals, status: totals.error ? 'failed' : b.status })
    .where(eq(recordImports.id, b.id))
    .returning();
  if (committed) await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e.subjectType}.imported`, subjectType: 'import', subjectId: b.id, data: { entity: e.key, fileName: b.fileName, mode: b.mode, totals } });
  return { ...view(saved), committed };
}
