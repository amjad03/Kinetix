import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';
import { createT } from '@/i18n/translate';
import { canImport, errorsFirst, fileProblem, headerKey, IMPORT_KINDS, MAX_FILE_BYTES, missingColumns, nextKind, ROW_ERROR_KEYS, rowErrorText, type ImportResult, type ImportRow } from './import';

const en = createT('en', MESSAGES.en);
const hi = createT('hi', MESSAGES.hi);
const kn = createT('kn', MESSAGES.kn);

const result = (rows: ImportRow[], dryRun = true): ImportResult => {
  const totals = { rows: rows.length, created: 0, updated: 0, skipped: 0, error: 0 };
  for (const r of rows) totals[r.status]++;
  return { kind: 'students', dryRun, committed: !dryRun && totals.error === 0, totals, rows };
};

describe('bulk import', () => {
  it('goes programs → staff → students → timetable', () => {
    expect(IMPORT_KINDS).toEqual(['programs', 'staff', 'students', 'timetable']);
    expect(nextKind('programs')).toBe('staff');
    expect(nextKind('students')).toBe('timetable');
    expect(nextKind('timetable')).toBeNull();
  });

  it('finds missing columns the way the API reads headers, skipping comments and a byte-order mark', () => {
    expect(headerKey(' Roll No ')).toBe('roll_no');
    expect(missingColumns('﻿# KINETIX import: students\n# roll_no …\nRoll No,"Full Name",Section\nR1,आरव मिश्रा,BSc Sem 1 A\n', 'students')).toEqual([]);
    expect(missingColumns('roll_no,full_name\nR1,A\n', 'students')).toEqual(['section']);
    expect(missingColumns('', 'timetable')).toEqual(['section', 'subject_code', 'teacher', 'day', 'start', 'end']);
  });

  it('accepts .csv files up to 6 MB', () => {
    expect(fileProblem({ name: 'students.CSV', size: 1000 })).toBeNull();
    expect(fileProblem({ name: 'students.xlsx', size: 1000 })).toBe('import.err.file');
    expect(fileProblem({ name: 'students.csv', size: MAX_FILE_BYTES + 1 })).toBe('import.err.size');
  });

  it('can import only a dry run with rows and no errors', () => {
    expect(canImport(null)).toBe(false);
    expect(canImport(result([{ row: 2, status: 'created', message: 'x' }]))).toBe(true);
    expect(canImport(result([{ row: 2, status: 'created', message: 'x' }, { row: 3, status: 'error', message: 'No class with this name', code: 'IMPORT_UNKNOWN_CLASS' }]))).toBe(false);
    expect(canImport(result([{ row: 2, status: 'created', message: 'x' }], false))).toBe(false);
    expect(canImport(result([]))).toBe(false);
  });

  it('lists errors first, then in file order', () => {
    const rows: ImportRow[] = [
      { row: 4, status: 'created', message: 'a' },
      { row: 9, status: 'error', message: 'e1' },
      { row: 2, status: 'skipped', message: 'b' },
      { row: 5, status: 'error', message: 'e2' },
    ];
    expect(errorsFirst(rows).map((r) => r.row)).toEqual([5, 9, 2, 4]);
  });

  it('words row errors in each language, with the value from the file', () => {
    const row: ImportRow = { row: 15, status: 'error', message: 'No class with this name', code: 'IMPORT_UNKNOWN_CLASS', detail: 'BSc Sem 7 Z' };
    expect(rowErrorText(row, en)).toEqual({ text: 'No class with this name. Import programs and classes first.', detail: 'BSc Sem 7 Z' });
    expect(rowErrorText(row, hi).text).toBe('इस नाम की कोई कक्षा नहीं है। पहले प्रोग्राम और कक्षाएँ आयात करें।');
    expect(rowErrorText(row, kn).detail).toBe('BSc Sem 7 Z');
    // A clash: the API's sentence (naming the class and time) is the detail.
    const clash: ImportRow = { row: 3, status: 'error', message: 'This teacher is already teaching at 11:00–11:55 that day', code: 'TIMETABLE_TEACHER_CLASH' };
    expect(rowErrorText(clash, kn)).toEqual({ text: 'ಈ ಸಮಯದಲ್ಲಿ ಶಿಕ್ಷಕರು ಈಗಾಗಲೇ ಕಲಿಸುತ್ತಿದ್ದಾರೆ', detail: 'This teacher is already teaching at 11:00–11:55 that day' });
    // An unknown code: English as the API says it; Hindi a general line with the English.
    const other: ImportRow = { row: 7, status: 'error', message: 'Choose a member of the teaching staff', code: 'BAD_REQUEST' };
    expect(rowErrorText(other, en)).toEqual({ text: 'Choose a member of the teaching staff', detail: undefined });
    expect(rowErrorText(other, hi)).toEqual({ text: 'यह पंक्ति जाँचें।', detail: 'Choose a member of the teaching staff' });
  });

  it('has a translation for every row error code', () => {
    for (const key of Object.values(ROW_ERROR_KEYS)) for (const l of ['en', 'hi', 'kn'] as const) expect(MESSAGES[l][key], `${l} ${key}`).toBeTruthy();
  });
});
