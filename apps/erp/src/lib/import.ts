// Bulk import (ERP → Import, POST /v1/admin/import/:kind): the four files in order, what the API
// returns for each row, and how the page words it.

import type { MessageKey } from '@/i18n/messages';
import type { TFunction } from '@/i18n/translate';

/** The four files that set up an institution, then the seven onboarding data families (services/api/src/import/templates.ts). */
export const IMPORT_KINDS = ['programs', 'staff', 'students', 'timetable', 'outcomes', 'exams', 'fees', 'library', 'placement', 'research', 'quality'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export type RowStatus = 'created' | 'updated' | 'skipped' | 'error';

export interface ImportRow {
  /** The line in the file. */
  row: number;
  status: RowStatus;
  message: string;
  code?: string;
  detail?: string;
}

export interface ImportResult {
  kind: ImportKind;
  dryRun: boolean;
  committed: boolean;
  totals: { rows: number; created: number; updated: number; skipped: number; error: number };
  rows: ImportRow[];
}

/** The API takes up to 6 MB (5,000 rows is far less). */
export const MAX_FILE_BYTES = 6 * 1024 * 1024;

/** Columns the API requires (services/api/src/import/import.service.ts REQUIRED). */
export const REQUIRED_COLUMNS: Record<ImportKind, string[]> = {
  programs: ['program', 'level', 'terms'],
  staff: ['full_name', 'roles'],
  students: ['roll_no', 'full_name', 'section'],
  timetable: ['section', 'subject_code', 'teacher', 'day', 'start', 'end'],
  outcomes: ['type', 'program', 'code', 'statement'],
  exams: ['program', 'term', 'name', 'starts_on', 'ends_on'],
  fees: ['structure', 'head', 'amount'],
  library: ['title'],
  placement: ['company'],
  research: ['owner_email', 'title', 'venue', 'year'],
  quality: ['framework', 'code', 'title'],
};

export const STEP_LABEL: Record<ImportKind, MessageKey> = {
  programs: 'import.step.programs',
  staff: 'import.step.staff',
  students: 'import.step.students',
  timetable: 'import.step.timetable',
  outcomes: 'import.step.outcomes',
  exams: 'import.step.exams',
  fees: 'import.step.fees',
  library: 'import.step.library',
  placement: 'import.step.placement',
  research: 'import.step.research',
  quality: 'import.step.quality',
};

export const STEP_HELP: Record<ImportKind, MessageKey> = {
  programs: 'import.help.programs',
  staff: 'import.help.staff',
  students: 'import.help.students',
  timetable: 'import.help.timetable',
  outcomes: 'import.help.outcomes',
  exams: 'import.help.exams',
  fees: 'import.help.fees',
  library: 'import.help.library',
  placement: 'import.help.placement',
  research: 'import.help.research',
  quality: 'import.help.quality',
};

export const STATUS_LABEL: Record<RowStatus, MessageKey> = {
  created: 'import.status.created',
  updated: 'import.status.updated',
  skipped: 'import.status.skipped',
  error: 'import.status.error',
};

/** Row error codes the page words itself; others show a general line with the API's English. */
const ROW_ERROR_CODES = [
  'IMPORT_REQUIRED',
  'IMPORT_INVALID_VALUE',
  'IMPORT_BAD_LEVEL',
  'IMPORT_BAD_TERM',
  'IMPORT_PROGRAM_CONFLICT',
  'IMPORT_BAD_ROLE',
  'IMPORT_BAD_LANGUAGE',
  'IMPORT_NO_CONTACT',
  'IMPORT_BAD_EMAIL',
  'PHONE_INVALID',
  'IMPORT_CONTACT_MISMATCH',
  'IMPORT_CONTACT_TAKEN',
  'IMPORT_UNKNOWN_CLASS',
  'IMPORT_UNKNOWN_SUBJECT',
  'IMPORT_UNKNOWN_TEACHER',
  'IMPORT_BAD_DAY',
  'IMPORT_BAD_TIME',
  'IMPORT_DUPLICATE_ROW',
  'IMPORT_DUPLICATE_CLASS',
  'IMPORT_GUARDIAN_INCOMPLETE',
  'IMPORT_GUARDIAN_NOT_FAMILY',
  'IMPORT_ROW_FAILED',
  'TIMETABLE_CLASS_CLASH',
  'TIMETABLE_TEACHER_CLASH',
  'TIMETABLE_ROOM_CLASH',
] as const;

export const ROW_ERROR_KEYS = Object.fromEntries(ROW_ERROR_CODES.map((c) => [c, `import.err.${c}` as MessageKey])) as Record<(typeof ROW_ERROR_CODES)[number], MessageKey>;

/**
 * An error row in the user's language: the ERP's wording for a known code, and the detail (the
 * value from the file, or for a clash the API's sentence naming the class and time). Unknown codes:
 * the API's English as is in English, a general line plus that English in Hindi and Kannada.
 */
export function rowErrorText(row: ImportRow, t: TFunction): { text: string; detail?: string } {
  const key = row.code ? ROW_ERROR_KEYS[row.code as keyof typeof ROW_ERROR_KEYS] : undefined;
  const clash = row.code?.startsWith('TIMETABLE_');
  if (key) return { text: t(key), detail: row.detail ?? (clash ? row.message : undefined) };
  if (t.locale === 'en') return { text: row.message || t('import.err.generic'), detail: row.detail };
  return { text: t('import.err.generic'), detail: [row.message, row.detail].filter(Boolean).join(': ') || undefined };
}

/** A dry run with rows and no errors can be imported. */
export function canImport(r: ImportResult | null): boolean {
  return !!r && r.dryRun && r.totals.rows > 0 && r.totals.error === 0;
}

/** The next file after this one, or null after the last. */
export function nextKind(kind: ImportKind): ImportKind | null {
  return IMPORT_KINDS[IMPORT_KINDS.indexOf(kind) + 1] ?? null;
}

/** Why a chosen file cannot be sent, before reading it. */
export function fileProblem(file: { name: string; size: number }): 'import.err.file' | 'import.err.size' | null {
  if (!/\.(csv|txt)$/i.test(file.name)) return 'import.err.file';
  if (file.size > MAX_FILE_BYTES) return 'import.err.size';
  return null;
}

/** Header keys the way the API reads them: "Subject code" → subject_code. */
export function headerKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The header row: the first line that is not blank or a `#` comment (a byte-order mark is ignored). */
function headerLine(csv: string): string | null {
  for (const line of csv.replace(/^﻿/, '').split(/\r?\n/)) {
    if (line.startsWith('#') || !line.trim()) continue;
    return line;
  }
  return null;
}

/** Required columns the file does not have (checked before sending, so the page can name them). */
export function missingColumns(csv: string, kind: ImportKind): string[] {
  const header = headerLine(csv);
  const have = new Set((header ?? '').split(',').map((h) => headerKey(h.replace(/^"|"$/g, ''))));
  return REQUIRED_COLUMNS[kind].filter((c) => !have.has(c));
}

/** Errors first, then in file order. */
export function errorsFirst(rows: ImportRow[]): ImportRow[] {
  return [...rows].sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error') || a.row - b.row);
}
