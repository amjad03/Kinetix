/**
 * University result sheets in, our marks history out: reads a result sheet in the column layout the
 * profile names (VTU: USN, Subject Code, Internal Marks, External Marks, Total, Result P/F/A/W/X/NE; state
 * universities: Reg No, Paper Code, IA, SEE, ...) and turns it into the data-migration "marks" layout,
 * so the import keeps its dry run, reconciliation and rollback.
 */
import { parseCsv } from '../import/csv.js';
import { RESULT_SHEET_FIELDS, type ProfileRules, type ResultSheetField } from './rules.js';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Which column of the sheet holds each field (by the profile's headings), and the headings nobody matched. */
export function matchColumns(rules: ProfileRules, headers: string[]): { columns: Partial<Record<ResultSheetField, number>>; unmatched: string[] } {
  const columns: Partial<Record<ResultSheetField, number>> = {};
  const keys = headers.map(norm);
  for (const f of RESULT_SHEET_FIELDS) {
    const names = rules.resultSheet.columns[f] ?? [];
    const at = keys.findIndex((k) => names.some((n) => norm(n) === k));
    if (at >= 0 && !Object.values(columns).includes(at)) columns[f] = at;
  }
  const used = new Set(Object.values(columns));
  return { columns, unmatched: headers.filter((_, i) => !used.has(i)) };
}

export const MIGRATION_MARK_COLUMNS = ['roll_no', 'academic_year', 'term', 'subject_code', 'subject_name', 'credits', 'internal_marks', 'external_marks', 'max_internal', 'max_external', 'grade', 'grade_point', 'result'] as const;

export interface SheetRow {
  line: number;
  values: Record<(typeof MIGRATION_MARK_COLUMNS)[number], string>;
  outcome: string;
}

export interface SheetReading {
  columns: Partial<Record<ResultSheetField, number>>;
  unmatched: string[];
  missing: ResultSheetField[];
  rows: SheetRow[];
  problems: { line: number; message: string }[];
}

const num = (v: string | undefined) => {
  const t = (v ?? '').trim();
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Reads the sheet. Marks maxima come from the sheet when it has them, else from the profile's theory split.
 * A missing external mark with result "absent" stays empty; unknown result codes are reported, not guessed.
 */
export function readResultSheet(rules: ProfileRules, text: string, ctx: { academicYear: string; term: number }): SheetReading {
  const records = parseCsv(text).filter((r) => r.cells.some((c) => c.trim()));
  const problems: { line: number; message: string }[] = [];
  if (records.length === 0) return { columns: {}, unmatched: [], missing: ['registerNo', 'subjectCode'], rows: [], problems: [{ line: 1, message: 'The sheet is empty' }] };
  const { columns, unmatched } = matchColumns(rules, records[0].cells.map((c) => c.trim()));
  const missing: ResultSheetField[] = (['registerNo', 'subjectCode'] as const).filter((f) => columns[f] === undefined);
  if (columns.internal === undefined && columns.external === undefined && columns.total === undefined && columns.grade === undefined) missing.push('total');
  if (missing.length) return { columns, unmatched, missing, rows: [], problems };

  const codes = Object.fromEntries(Object.entries(rules.resultSheet.resultCodes).map(([k, v]) => [norm(k), v]));
  const cell = (r: string[], f: ResultSheetField) => (columns[f] === undefined ? '' : (r[columns[f]!] ?? '').trim());
  const rows: SheetRow[] = [];
  for (const rec of records.slice(1)) {
    const c = rec.cells;
    const reg = cell(c, 'registerNo').toUpperCase();
    const code = cell(c, 'subjectCode').toUpperCase();
    if (!reg || !code) {
      problems.push({ line: rec.line, message: 'Register number or subject code is empty' });
      continue;
    }
    const resultText = cell(c, 'result');
    const outcome = resultText ? codes[norm(resultText)] : undefined;
    if (resultText && !outcome) {
      problems.push({ line: rec.line, message: `Result "${resultText}" is not one of the codes this profile knows (${Object.keys(rules.resultSheet.resultCodes).join(', ')})` });
      continue;
    }
    let internal = num(cell(c, 'internal'));
    let external = num(cell(c, 'external'));
    const total = num(cell(c, 'total'));
    if ([internal, external, total].some((v) => Number.isNaN(v))) {
      problems.push({ line: rec.line, message: 'A marks cell is not a number' });
      continue;
    }
    let maxI = num(cell(c, 'maxInternal')) ?? rules.assessment.theory.internal;
    let maxE = num(cell(c, 'maxExternal')) ?? rules.assessment.theory.external;
    // A sheet with only the total: keep the whole mark as one part out of the whole maximum.
    if (internal === null && external === null && total !== null) {
      external = total;
      maxE = (maxI ?? 0) + (maxE ?? 0);
      maxI = 0;
    }
    if (outcome === 'absent') external = null;
    const out = outcome ?? (total !== null || external !== null ? 'pass' : 'fail');
    rows.push({
      line: rec.line,
      outcome: out,
      values: {
        roll_no: reg,
        academic_year: ctx.academicYear,
        term: String(ctx.term),
        subject_code: code,
        subject_name: cell(c, 'subjectName'),
        credits: cell(c, 'credits'),
        internal_marks: internal === null ? '' : String(internal),
        external_marks: external === null ? '' : String(external),
        max_internal: String(maxI),
        max_external: String(maxE),
        grade: cell(c, 'grade'),
        grade_point: cell(c, 'gradePoint'),
        result: out === 'pass' ? 'pass' : out === 'absent' ? 'absent' : 'fail',
      },
    });
  }
  return { columns, unmatched, missing: [], rows, problems };
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The rows as a CSV in the data-migration "marks" layout (headers are the field keys themselves). */
export function toMigrationCsv(rows: SheetRow[]): string {
  return [MIGRATION_MARK_COLUMNS.join(','), ...rows.map((r) => MIGRATION_MARK_COLUMNS.map((k) => csvCell(r.values[k])).join(','))].join('\r\n') + '\r\n';
}
