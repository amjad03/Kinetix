import { describe, expect, it } from 'vitest';
import { PdfWriter, toCsv } from '../common/pdf.js';
import { cgpa, GRADE_SCALE_PRESETS, gradeFor, SCHEME_PRESETS, sgpa, subjectResult, validateBands, validateWeights, type SchemeComponent } from './grading.js';
import { allocateSeats, overlaps, slotGroups } from './seating.js';

const bu = GRADE_SCALE_PRESETS['bu-nep'];
const comps: SchemeComponent[] = SCHEME_PRESETS['bu-nep'].components.map((c, i) => ({ ...c, id: `c${i}` }));
const pass = SCHEME_PRESETS['bu-nep'].pass;
const ev = (...scores: [number, number][]) => scores.map(([scored, max], i) => ({ componentId: `c${i}`, entries: [{ scored, max, absent: false }] }));

describe('grading maths', () => {
  it('weights a BU NEP subject (IA 40 + SEE 60) and prints the percentage over ten as the grade point', () => {
    const r = subjectResult(comps, ev([16, 20], [8, 10], [9, 10], [45, 60]), pass, bu);
    expect(r.percent).toBe(78); // 16 + 8 + 9 + 45
    expect(r.grade).toBe('A');
    expect(r.gradePoint).toBe(7.8);
    expect(r.passed).toBe(true);
  });

  it('fails a student below the external minimum even when the total is enough', () => {
    const r = subjectResult(comps, ev([20, 20], [10, 10], [10, 10], [24, 60]), pass, bu); // 40 + 24 = 64 total, SEE 40% -> exactly the minimum
    expect(r.passed).toBe(true);
    const f = subjectResult(comps, ev([20, 20], [10, 10], [10, 10], [23, 60]), pass, bu); // SEE 38.3% < 40
    expect(f.percent).toBe(63);
    expect(f.passed).toBe(false);
    expect(f.reasons).toEqual(['external']);
    expect(f.grade).toBe('F');
    expect(f.gradePoint).toBe(0);
  });

  it('counts absentees as zero and flags incomplete evidence', () => {
    const r = subjectResult(comps, [{ componentId: 'c0', entries: [{ scored: null, max: 20, absent: true }] }], pass, bu);
    expect(r.complete).toBe(false);
    expect(r.percent).toBe(0);
  });

  it('grades CBSE style with band points', () => {
    const cb = SCHEME_PRESETS.cbse;
    const cc = cb.components.map((c, i) => ({ ...c, id: `c${i}` }));
    const r = subjectResult(cc, ev([9, 10], [5, 5], [4, 5], [72, 80]), cb.pass, GRADE_SCALE_PRESETS.cbse);
    expect(r.percent).toBe(90); // 9 + 5 + 4 + 72
    expect(r.grade).toBe('A2');
    expect(r.gradePoint).toBe(9);
    expect(gradeFor(GRADE_SCALE_PRESETS.cbse, 91).grade).toBe('A1');
    expect(gradeFor(GRADE_SCALE_PRESETS.cbse, 32.9).grade).toBe('E');
  });

  it('computes SGPA from credit points and counts a failed subject as zero', () => {
    const t = sgpa([
      { credits: 4, gradePoint: 8, passed: true },
      { credits: 3, gradePoint: 9, passed: true },
      { credits: 3, gradePoint: 7, passed: true },
      { credits: 2, gradePoint: 5, passed: false },
    ]);
    // (32 + 27 + 21 + 0) / 12
    expect(t.creditPoints).toBe(80);
    expect(t.creditsAttempted).toBe(12);
    expect(t.creditsEarned).toBe(10);
    expect(t.sgpa).toBe(6.67);
  });

  it('computes CGPA over all terms from unrounded credit points', () => {
    const t1 = sgpa([{ credits: 12, gradePoint: 6.6666, passed: true }]);
    const t2 = sgpa([{ credits: 10, gradePoint: 8.5, passed: true }]);
    // (80 + 85) / 22 = 7.5
    expect(cgpa([{ creditsAttempted: 12, creditPoints: 80 }, { creditsAttempted: 10, creditPoints: 85 }])).toBe(7.5);
    expect(t2.sgpa).toBe(8.5);
    expect(t1.sgpa).toBe(6.67);
    expect(cgpa([])).toBe(0);
  });

  it('validates weights and grade bands', () => {
    expect(validateWeights(comps)).toBeNull();
    expect(validateWeights([{ weight: 50 }, { weight: 40 }])).toMatch('100');
    expect(validateBands(bu.bands)).toBeNull();
    expect(validateBands([{ grade: 'A', minPercent: 50, gradePoint: 10, pass: true }])).toMatch('0%');
  });
});

describe('seating', () => {
  const cand = (paperId: string, n: number) => Array.from({ length: n }, (_, i) => ({ paperId, studentId: `${paperId}${i}`, rollNo: String(i + 1) }));
  it('interleaves papers so neighbours write different papers and fills halls in order', () => {
    const seats = allocateSeats([...cand('A', 3), ...cand('B', 3)], [{ roomId: 'r1', name: 'R1', capacity: 4 }, { roomId: 'r2', name: 'R2', capacity: 4 }]);
    expect(seats.map((s) => `${s.roomId}${s.seatNo}${s.paperId}`)).toEqual(['r11A', 'r12B', 'r13A', 'r14B', 'r21A', 'r22B']);
  });
  it('refuses when there are not enough seats', () => {
    expect(() => allocateSeats(cand('A', 5), [{ roomId: 'r', name: 'R', capacity: 4 }])).toThrow(/only 4 seats/);
  });
  it('groups overlapping papers of one day and spots clashes', () => {
    const p = (id: string, d: string, s: string, e: string) => ({ id, examDate: d, startsAt: s, endsAt: e });
    expect(slotGroups([p('a', '2026-11-02', '10:00', '13:00'), p('b', '2026-11-02', '10:00', '13:00'), p('c', '2026-11-03', '10:00', '13:00'), p('d', '2026-11-02', '14:00', '17:00')])).toEqual([['a', 'b'], ['d'], ['c']]);
    expect(overlaps(p('a', 'x', '10:00', '13:00'), p('b', 'x', '12:00', '14:00'))).toBe(true);
    expect(overlaps(p('a', 'x', '10:00', '13:00'), p('b', 'x', '13:00', '14:00'))).toBe(false);
  });
});

describe('documents', () => {
  it('writes a PDF with a header and trailer', () => {
    const w = new PdfWriter();
    w.text('Hello (world) \\ Ünïcode ಕನ್ನಡ');
    const b = w.build().toString('latin1');
    expect(b.startsWith('%PDF-1.4')).toBe(true);
    expect(b).toContain('%%EOF');
    expect(b).toContain('Hello \\(world\\)');
  });
  it('quotes CSV cells and defuses formulas', () => {
    expect(toCsv([['a,b', '=1+1', 'x"y', 5]])).toBe('"a,b",\'=1+1,"x""y",5\r\n');
  });
});
