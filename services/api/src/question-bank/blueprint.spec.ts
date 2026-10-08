import { describe, expect, it } from 'vitest';
import { blueprintProblems, type Candidate, pickSection, seeded } from './blueprint.js';

const c = (id: string, bloom: string, difficulty: string, coId: string | null, recent = false): Candidate => ({ id, bloom, difficulty, coId, marks: 2, type: 'short', recent });

describe('blueprint selection', () => {
  const pool = [c('a', 'remember', 'easy', 'c1'), c('b', 'apply', 'hard', 'c2'), c('c', 'apply', 'easy', 'c1', true), c('d', 'understand', 'medium', 'c3'), c('e', 'remember', 'hard', 'c2', true)];

  it('meets exact Bloom, difficulty and outcome requirements, and is repeatable for a seed', () => {
    const sec = { name: 'A', count: 3, questionMarks: 2, bloom: { remember: 1, apply: 1 }, difficulty: { hard: 1 }, coverage: ['c3'] };
    const one = pickSection(pool, sec, seeded('s1'));
    if ('error' in one) throw new Error(one.error);
    expect(one.repeats).toBe(0);
    expect(one.ids).toHaveLength(3);
    expect(one.ids).toContain('d');
    expect(pickSection(pool, sec, seeded('s1'))).toEqual(one);
  });

  it('uses a recently used question only when the blueprint cannot be met without it', () => {
    const sec = { name: 'A', count: 2, questionMarks: 2, bloom: { remember: 2 } };
    expect(pickSection(pool, sec, seeded('x'))).toMatchObject({ repeats: 1 });
    expect(pickSection(pool, { ...sec, bloom: { apply: 1 } }, seeded('x'))).toMatchObject({ repeats: 0 });
  });

  it('says what is missing', () => {
    const r = pickSection(pool, { name: 'A', count: 2, questionMarks: 2, bloom: { create: 1 } }, seeded('x'));
    expect(r).toEqual({ error: 'needs 1 create questions, only 0 exist' });
    expect(blueprintProblems([{ name: 'A', count: 2, questionMarks: 2 }], 5)).toEqual(['Sections add up to 4 marks, not 5']);
  });
});
