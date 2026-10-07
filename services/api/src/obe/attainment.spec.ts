import { describe, expect, it } from 'vitest';
import { combinedAttainment, DEFAULT_ATTAINMENT_CONFIG as C, directAttainment, gapFor, indirectAttainment, levelFor, programOutcomeAttainment, trend, validateConfig, type EvidenceItem } from './attainment.js';

const students = (scores: number[], max = 10) => scores.map((scored, i) => ({ studentId: `s${i}`, scored, max }));

describe('OBE attainment maths', () => {
  it('maps the share of students attaining the threshold to a level', () => {
    expect(levelFor(C, 70)).toBe(3);
    expect(levelFor(C, 69.9)).toBe(2);
    expect(levelFor(C, 60)).toBe(2);
    expect(levelFor(C, 50)).toBe(1);
    expect(levelFor(C, 49)).toBe(0);
  });

  it('weights internal and external direct attainment (30/70)', () => {
    // CIE: 7 of 10 students score >= 60% -> 70% -> level 3. SEE: 5 of 10 -> 50% -> level 1.
    const items: EvidenceItem[] = [
      { sourceId: 'ia', label: 'IA test', kind: 'internal', scores: students([9, 8, 7, 6, 6, 6, 6, 5, 4, 3]) },
      { sourceId: 'see', label: 'SEE Q1', kind: 'external', scores: students([9, 8, 7, 6, 6, 5, 4, 3, 2, 1]) },
    ];
    const d = directAttainment(items, C);
    expect(d.byKind.map((k) => [k.kind, k.percentAttained, k.level])).toEqual([['external', 50, 1], ['internal', 70, 3]]);
    expect(d.level).toBe(1.6); // (30*3 + 70*1) / 100
    expect(d.weakItems.map((w) => w.sourceId)).toEqual(['see']);
  });

  it('pools several assessments per student before applying the threshold', () => {
    // Student scores 5/10 and 8/10: pooled 13/20 = 65% >= 60 -> attains.
    const d = directAttainment([{ sourceId: 'a', label: 'a', kind: 'internal', scores: [{ studentId: 's', scored: 5, max: 10 }] }, { sourceId: 'b', label: 'b', kind: 'internal', scores: [{ studentId: 's', scored: 8, max: 10 }] }], C);
    expect(d.byKind[0].attained).toBe(1);
  });

  it('scales indirect ratings to the level scale and ignores thin surveys', () => {
    const s = (id: string, mean: number, responses: number, weight = 1) => ({ surveyId: id, title: id, meanRating: mean, scaleMax: 5, responses, minResponses: 5, weight });
    expect(indirectAttainment([s('a', 4, 30)], C).level).toBe(2.4); // 4/5 * 3
    const mixed = indirectAttainment([s('a', 4, 30, 1), s('b', 5, 10, 3), s('c', 1, 2)], C);
    expect(mixed.level).toBe(2.85); // (1*2.4 + 3*3) / 4
    expect(mixed.skipped).toEqual(['c']);
    expect(indirectAttainment([s('c', 1, 2)], C).level).toBeNull();
  });

  it('combines direct 80 and indirect 20, falling back to direct only', () => {
    expect(combinedAttainment(1.6, 2.4, C)).toBe(1.76); // (80*1.6 + 20*2.4)/100
    expect(combinedAttainment(1.6, null, C)).toBe(1.6);
    expect(combinedAttainment(null, null, C)).toBeNull();
  });

  it('aggregates PO attainment by CO-PO strength', () => {
    const r = programOutcomeAttainment([{ coId: 'a', strength: 3, coAttainment: 2 }, { coId: 'b', strength: 1, coAttainment: 3 }, { coId: 'c', strength: 2, coAttainment: null }], C);
    expect(r.level).toBe(2.25); // (6 + 3) / 4
    expect(r.coverage).toBe(66.7);
  });

  it('gaps, trend and config validation', () => {
    expect(gapFor(1.76, 2)).toEqual({ target: 2, actual: 1.76, gap: 0.24, met: false });
    expect(gapFor(2.5, 2).met).toBe(true);
    expect(gapFor(null, 2).gap).toBeNull();
    expect(trend(1.5, 1.76)).toBe('up');
    expect(trend(2, 1.9)).toBe('down');
    expect(trend(null, 1)).toBe('new');
    expect(validateConfig(C)).toBeNull();
    expect(validateConfig({ ...C, targetLevel: 5 })).toMatch('target');
  });
});
