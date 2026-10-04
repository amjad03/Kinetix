import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeUtf8, headerKey, parseCsv, readTable } from './csv.js';
import { IMPORT_KINDS, TEMPLATES } from './templates.js';

describe('CSV reader', () => {
  it('reads quoted fields, CRLF, a byte-order mark, comments and blank lines, keeping line numbers', () => {
    const text = '﻿# comment, with a comma\r\nname,note\r\n"Rao, Meera","said ""hi""\nthen left"\r\n\r\nಕಾವ್ಯ ಶೆಟ್ಟಿ,  ok  \r\n';
    expect(parseCsv(text)).toEqual([
      { line: 2, cells: ['name', 'note'] },
      { line: 3, cells: ['Rao, Meera', 'said "hi"\nthen left'] },
      { line: 6, cells: ['ಕಾವ್ಯ ಶೆಟ್ಟಿ', 'ok'] },
    ]);
  });

  it('normalises headers and reads rows by header', () => {
    expect(headerKey(' Subject Code ')).toBe('subject_code');
    expect(headerKey('GUARDIAN-1 phone')).toBe('guardian_1_phone');
    const t = readTable('Roll No,Full Name\nR1,आरव मिश्रा\n');
    expect(t.headers).toEqual(['roll_no', 'full_name']);
    expect(t.rows[0].get('full_name')).toBe('आरव मिश्रा');
    expect(t.rows[0].get('missing')).toBe('');
    expect(t.rows[0].line).toBe(2);
  });

  it('refuses text that is not UTF-8', () => {
    expect(decodeUtf8(new TextEncoder().encode('ಕನ್ನಡ'))).toBe('ಕನ್ನಡ');
    expect(decodeUtf8(new Uint8Array([0x52, 0x61, 0xe9, 0x6c]))).toBeNull(); // "Raél" in Windows-1252
  });

  it('ships the same templates as docs/operations/import-templates', () => {
    for (const kind of IMPORT_KINDS) {
      const doc = readFileSync(new URL(`../../../../docs/operations/import-templates/${kind}.csv`, import.meta.url), 'utf8');
      expect(doc, kind).toBe(TEMPLATES[kind]);
    }
  });
});
