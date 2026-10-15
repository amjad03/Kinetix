import { describe, expect, it } from 'vitest';
import { articulationMatrix, blueprintShares, combinedAttainment, DEFAULT_ATTAINMENT_CONFIG as C, directAttainment, gapFor, indirectAttainment, levelFor, programOutcomeAttainment, questionCoMarks, trend, validateConfig, withDefaults, type EvidenceItem, type PoCell } from './attainment.js';

const students = (scores: number[], max = 10) => scores.map((scored, i) => ({ studentId: `s${i}`, scored, max }));
// CIE: 7 of 10 students at >= 60%, class average 60%. SEE: 4 of 10 at >= 60%, class average 50%.
const items: EvidenceItem[] = [
  { sourceId: 'ia', label: 'IA test', kind: 'internal', scores: students([9, 8, 7, 6, 6, 6, 6, 5, 4, 3]) },
  { sourceId: 'see', label: 'SEE Q1', kind: 'external', scores: students([9, 8, 7, 6, 5, 5, 4, 3, 2, 1]) },
];

describe('OBE attainment maths', () => {
  it('uses the approved defaults: 60% threshold, levels at 40/50/60% of students, CIE 40 : SEE 60, direct 80 : indirect 20', () => {
    expect(C).toMatchObject({ studentThresholdPercent: 60, evidenceWeights: { internal: 40, external: 60 }, directWeight: 80, indirectWeight: 20, maxLevel: 3, coMethod: 'threshold', poMethod: 'course_weighted', seeApportion: 'blueprint' });
    expect(levelFor(C, 60)).toBe(3);
    expect(levelFor(C, 59.9)).toBe(2);
    expect(levelFor(C, 50)).toBe(2);
    expect(levelFor(C, 40)).toBe(1);
    expect(levelFor(C, 39.9)).toBe(0);
    // An older stored policy keeps its own numbers and gains the methods.
    expect(withDefaults({ studentThresholdPercent: 50 })).toMatchObject({ studentThresholdPercent: 50, coMethod: 'threshold', poMethod: 'course_weighted' });
  });

  it('threshold method: weights CIE and SEE levels 40 : 60', () => {
    const d = directAttainment(items, C);
    // CIE 70% of students -> 3; SEE 40% -> 1; direct = (40*3 + 60*1) / 100 = 1.8.
    expect(d.byKind.map((k) => [k.kind, k.percentAttained, k.averagePercent, k.level])).toEqual([['external', 40, 50, 1], ['internal', 70, 60, 3]]);
    expect(d.level).toBe(1.8);
    expect(d.weakItems.map((w) => w.sourceId)).toEqual(['see']);
  });

  it('class-average method: the class average percentage gives the level', () => {
    // CIE average 60% -> 3; SEE average 50% -> 2; direct = (40*3 + 60*2) / 100 = 2.4.
    const d = directAttainment(items, { ...C, coMethod: 'class_average' });
    expect(d.byKind.map((k) => k.level)).toEqual([2, 3]);
    expect(d.level).toBe(2.4);
  });

  it('percentage method: the share of students attaining scaled to the top level', () => {
    // CIE 70% -> 2.1; SEE 40% -> 1.2; direct = (40*2.1 + 60*1.2) / 100 = 1.56.
    const d = directAttainment(items, { ...C, coMethod: 'percentage' });
    expect(d.byKind.map((k) => k.level)).toEqual([1.2, 2.1]);
    expect(d.level).toBe(1.56);
  });

  it('pools several items per student before applying the threshold', () => {
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
    expect(combinedAttainment(1.8, 2.4, C)).toBe(1.92); // (80*1.8 + 20*2.4)/100
    expect(combinedAttainment(1.8, null, C)).toBe(1.8);
    expect(combinedAttainment(null, null, C)).toBeNull();
  });

  // Course A: a1 (strength 3, CO 2.0), a2 (1, 3.0). Course B: b1 (2, 1.0), b2 (2, not measured), b3 (0 = not mapped).
  const cells: PoCell[] = [
    { coId: 'a1', courseId: 'A', strength: 3, coAttainment: 2 },
    { coId: 'a2', courseId: 'A', strength: 1, coAttainment: 3 },
    { coId: 'b1', courseId: 'B', strength: 2, coAttainment: 1 },
    { coId: 'b2', courseId: 'B', strength: 2, coAttainment: null },
    { coId: 'b3', courseId: 'B', strength: 0, coAttainment: 3 },
  ];

  it('rolls COs up to a PO course by course (default): weighted by the programme articulation matrix', () => {
    // A: articulation (3+1)/2 = 2, attainment (3*2 + 1*3)/4 = 2.25. B: articulation (2+2)/2 = 2, attainment 1 (b1 only).
    // PO = (2*2.25 + 2*1) / (2+2) = 1.625 -> 1.63.
    const r = programOutcomeAttainment(cells, C);
    expect(r.level).toBe(1.63);
    expect(r.coverage).toBe(75);
    expect(r.byCourse).toEqual([
      { courseId: 'A', articulation: 2, attainment: 2.25, cos: 2 },
      { courseId: 'B', articulation: 2, attainment: 1, cos: 2 },
    ]);
  });

  it('rolls COs up to a PO over all mapped COs (co_weighted)', () => {
    // (3*2 + 1*3 + 2*1) / (3+1+2) = 11/6 = 1.83.
    expect(programOutcomeAttainment(cells, { ...C, poMethod: 'co_weighted' }).level).toBe(1.83);
  });

  it('rolls whole-course attainment up to a PO (NBA course-average form)', () => {
    // Course averages over all their COs: A 2.0, B 1.5. PO = (2*2 + 2*1.5) / 4 = 1.75.
    const r = programOutcomeAttainment(cells, { ...C, poMethod: 'course_average' }, new Map([['A', 2], ['B', 1.5]]));
    expect(r.level).toBe(1.75);
  });

  it('builds the programme articulation matrix as the average strength per course and PO', () => {
    const m = articulationMatrix([
      { courseId: 'A', outcomeId: 'PO1', strength: 3 },
      { courseId: 'A', outcomeId: 'PO1', strength: 2 },
      { courseId: 'A', outcomeId: 'PO2', strength: 1 },
      { courseId: 'B', outcomeId: 'PO1', strength: 0 },
    ]);
    expect(m.get('A')?.get('PO1')).toBe(2.5);
    expect(m.get('A')?.get('PO2')).toBe(1);
    expect(m.get('B')).toBeUndefined();
  });

  it('apportions a total over the COs of the paper by its blueprint, or equally', () => {
    // Q1 10 marks on CO1; Q2 10 marks on CO1 and CO2 equally; Q3 20 on CO3; Q4 10 untagged. Paper 50.
    const paper = [
      { maxMarks: 10, cos: [{ coId: 'CO1', weight: 1 }] },
      { maxMarks: 10, cos: [{ coId: 'CO1', weight: 1 }, { coId: 'CO2', weight: 1 }] },
      { maxMarks: 20, cos: [{ coId: 'CO3', weight: 1 }] },
      { maxMarks: 10, cos: [] },
    ];
    const b = blueprintShares(paper, 'blueprint');
    expect([...b].map(([k, v]) => [k, Math.round(v * 1000) / 1000])).toEqual([['CO1', 0.3], ['CO2', 0.1], ['CO3', 0.4]]);
    const e = blueprintShares(paper, 'equal');
    expect([...e.values()].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.333, 0.333, 0.333]);
    expect(blueprintShares(paper, 'off').size).toBe(0);
  });

  it('splits question-wise marks over the COs of each question', () => {
    const qs = [
      { id: 'q1', maxMarks: 10, cos: [{ coId: 'CO1', weight: 1 }] },
      { id: 'q2', maxMarks: 10, cos: [{ coId: 'CO1', weight: 1 }, { coId: 'CO2', weight: 1 }] },
      { id: 'q3', maxMarks: 20, cos: [{ coId: 'CO3', weight: 1 }] },
    ];
    const m = questionCoMarks(qs, new Map([['q1', 8], ['q2', 6]]));
    expect(Object.fromEntries(m)).toEqual({ CO1: { scored: 11, max: 15 }, CO2: { scored: 3, max: 5 }, CO3: { scored: 0, max: 20 } });
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
    expect(validateConfig({ ...C, evidenceWeights: { internal: 0 } })).toMatch('weight');
  });
});
