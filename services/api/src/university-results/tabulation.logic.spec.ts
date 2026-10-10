import { describe, expect, it } from 'vitest';
import { nextQpState } from '../external-examiner/examiner.logic.js';
import { suggestMapping, toIsoDate, toPaise } from '../data-migration/migration.logic.js';
import { looksLikeXlsx, readXlsx, writeXlsx } from '../common/xlsx.js';
import { computeRegister, registerGrid, SAMPLE_TEMPLATES } from './tabulation.logic.js';

const vtu = SAMPLE_TEMPLATES[1]!.config;
const mk = (code: string, i: number, e: number) => ({ code, name: code, credits: 4, internal: i, maxInternal: 50, external: e, maxExternal: 50 });

describe('tabulation', () => {
  it('passes, fails and gives grace within limits', () => {
    const reg = computeRegister(vtu, [
      { rollNo: '1', name: 'A', subjects: [mk('X', 45, 40)] },
      { rollNo: '2', name: 'B', subjects: [mk('X', 45, 15)] }, // needs 3 external marks for 18/50 -> 35% min; total 60 >= 40
      { rollNo: '3', name: 'C', subjects: [mk('X', 10, 40)] }, // internal below 40%: no grace helps
    ]);
    expect(reg.rows[0]!.passed).toBe(true);
    expect(reg.rows[1]!.graceTotal).toBeGreaterThan(0);
    expect(reg.rows[1]!.passed).toBe(true);
    expect(reg.rows[2]!.passed).toBe(false);
    expect(registerGrid(vtu, 'T', reg).some((r) => r.includes('FAIL'))).toBe(true);
  });
  it('normalises internal marks and caps them', () => {
    const k = SAMPLE_TEMPLATES[0]!.config;
    const reg = computeRegister(k, [{ rollNo: '1', name: 'A', subjects: [{ code: 'Y', name: 'Y', credits: 4, internal: 40, maxInternal: 40, external: 70, maxExternal: 80 }] }]);
    expect(reg.rows[0]!.subjects[0]!.internal).toBe(19);
    expect(reg.rows[0]!.subjects[0]!.maxInternal).toBe(20);
  });
});

describe('migration helpers', () => {
  it('maps Linways-style headings, dates and money', () => {
    expect(suggestMapping('students', ['Admission No', 'Student Name', 'Class'])).toMatchObject({ roll_no: 'Admission No', section: 'Class' });
    expect(toIsoDate('05/03/2024')).toBe('2024-03-05');
    expect(toIsoDate('45356')).toBe('2024-03-05');
    expect(toPaise('₹ 1,250.50')).toBe(125050);
  });
  it('round-trips xlsx', () => {
    const b = writeXlsx('S', [['a', 'b & c'], [1, null, 'z']]);
    expect(looksLikeXlsx(b)).toBe(true);
    expect(readXlsx(b)).toEqual([['a', 'b & c'], ['1', '', 'z']]);
  });
});

describe('question paper states', () => {
  it('moves draft to locked only through the allowed steps', () => {
    expect(nextQpState('draft', 'submit', 'setter')).toBe('scrutiny');
    expect(nextQpState('scrutiny', 'approve', 'setter')).toBeNull();
    expect(nextQpState('scrutiny', 'approve', 'scrutiniser')).toBe('approved');
    expect(nextQpState('approved', 'lock', 'scrutiniser')).toBeNull();
    expect(nextQpState('approved', 'lock', 'office')).toBe('locked');
    expect(nextQpState('locked', 'return', 'office')).toBeNull();
  });
});
