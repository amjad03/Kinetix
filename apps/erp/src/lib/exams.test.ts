import { describe, expect, it } from 'vitest';
import { canEnterMarks, exportHref, nextStep, schemeProblem, weightTotal } from './exams';
import { fmtLevel, levelTone, nextStrength, setCell, strengthMap, uncoveredOutcomes, unmappedCos } from './obe';

describe('scheme form rules', () => {
  const c = (code: string, weight: number) => ({ code, name: code, kind: 'internal' as const, weight });
  it('adds weights without float drift and demands 100', () => {
    expect(weightTotal([c('a', 33.3), c('b', 33.3), c('c', 33.4)])).toBe(100);
    expect(schemeProblem({ name: 'x', credits: 4, components: [c('IA', 40), c('SEE', 60)] })).toBeNull();
    expect(schemeProblem({ name: 'x', credits: 4, components: [c('IA', 40), c('SEE', 50)] })).toBe('weights');
    expect(schemeProblem({ name: 'x', credits: 4, components: [c('IA', 50), c('IA', 50)] })).toBe('codes');
    expect(schemeProblem({ name: ' ', credits: 4, components: [c('IA', 100)] })).toBe('name');
    expect(schemeProblem({ name: 'x', credits: 0, components: [c('IA', 100)] })).toBe('credits');
    expect(schemeProblem({ name: 'x', credits: 1, components: [] })).toBe('components');
  });
  it('guides a session through its steps', () => {
    expect(['draft', 'scheduled', 'processed', 'published', 'locked'].map((s) => nextStep(s as 'draft', 2))).toEqual(['schedule', 'process', 'publish', 'lock', 'done']);
    expect(nextStep('draft', 0)).toBe('addPapers');
  });
  it('only lets drafts take marks, and builds download links', () => {
    expect(canEnterMarks('draft')).toBe(true);
    expect(canEnterMarks('verified')).toBe(false);
    expect(exportHref('/v1/x?a=b')).toBe('/api/export?path=%2Fv1%2Fx%3Fa%3Db');
  });
});

describe('CO-PO matrix helpers', () => {
  it('cycles strengths 0-3', () => {
    expect([0, 1, 2, 3].map(nextStrength)).toEqual([1, 2, 3, 0]);
  });
  it('sets, replaces and removes cells', () => {
    let cells = setCell([], 'co1', 'po1', 3);
    cells = setCell(cells, 'co1', 'po2', 1);
    cells = setCell(cells, 'co1', 'po1', 2);
    const get = strengthMap(cells);
    expect([get('co1', 'po1'), get('co1', 'po2'), get('co2', 'po1')]).toEqual([2, 1, 0]);
    expect(setCell(cells, 'co1', 'po2', 0)).toHaveLength(1);
  });
  it('finds unmapped COs and POs nothing maps to', () => {
    const cells = [{ coId: 'co1', outcomeId: 'po1', strength: 3 }];
    expect(unmappedCos([{ id: 'co1' }, { id: 'co2' }], cells).map((c) => c.id)).toEqual(['co2']);
    expect(uncoveredOutcomes([{ id: 'po1' }, { id: 'po2' }], cells).map((c) => c.id)).toEqual(['po2']);
  });
  it('colours attainment against the target', () => {
    expect(levelTone({ combined: 2.1, target: 2 })).toBe('met');
    expect(levelTone({ combined: 1.6, target: 2 })).toBe('near');
    expect(levelTone({ combined: 0.96, target: 2 })).toBe('short');
    expect(levelTone({ combined: null, target: 2 })).toBe('none');
    expect(fmtLevel(1.376)).toBe('1.38');
    expect(fmtLevel(null)).toBe('—');
  });
});
