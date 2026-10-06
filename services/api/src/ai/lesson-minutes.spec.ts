import { describe, expect, it } from 'vitest';
import { fitMinutes, postProcess, previewOutput } from './tasks.js';

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('lesson-plan minutes', () => {
  it('scales steps to the chosen length (the 45-minute plan for a 30-minute lesson)', () => {
    const out = fitMinutes([10, 25, 10], 30);
    expect(sum(out)).toBe(30);
    expect(out).toEqual([7, 16, 7]);
  });

  it('rounds to whole minutes, keeps at least 2 per step and puts the remainder on the longest step', () => {
    expect(fitMinutes([1, 40, 1, 1], 30)).toEqual([2, 24, 2, 2]);
    expect(fitMinutes([5, 5, 5], 10)).toEqual([4, 3, 3]);
    expect(fitMinutes([0, 0], 15)).toEqual([7, 8]);
    for (const total of [10, 20, 30, 35, 40, 45, 55, 60, 90]) {
      for (const steps of [[10, 25, 10], [5, 20, 20, 10], [3, 3, 3, 3, 3], [1, 1]]) {
        const out = fitMinutes(steps, total);
        expect(sum(out)).toBe(total);
        expect(Math.min(...out)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('fixes model and preview plans', () => {
    const plan = { objectives: [], steps: [{ minutes: 10, activity: 'a' }, { minutes: 35, activity: 'b' }], materials: [], assessment: '' };
    expect(sum(postProcess('lessonPlan', { topic: 'x', minutes: 30, language: 'en' } as never, plan).steps.map((s) => s.minutes))).toBe(30);
    for (const minutes of [10, 30, 40, 55, 180]) {
      const p = previewOutput('lessonPlan', { topic: 'x', minutes, language: 'en' } as never);
      expect(sum(p.steps.map((s) => s.minutes))).toBe(minutes);
    }
  });
});
