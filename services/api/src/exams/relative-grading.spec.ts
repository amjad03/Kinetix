import { describe, expect, it } from 'vitest';
import { classStats, DEFAULT_RELATIVE, distribution, gradeOnCurve, relativeCuts } from './relative-grading.js';

describe('relative grading', () => {
  it('works out the class mean and standard deviation', () => {
    expect(classStats([40, 50, 60, 70, 80])).toEqual({ candidates: 5, mean: 60, sd: 14.14 });
    expect(classStats([])).toEqual({ candidates: 0, mean: 0, sd: 0 });
  });

  it('sets the cut-offs at mean + z × SD, never below the pass mark, the lowest pass grade at the pass mark', () => {
    const cuts = relativeCuts({ candidates: 40, mean: 60, sd: 10 }, DEFAULT_RELATIVE.bands, 40);
    expect(cuts).toEqual([
      { grade: 'O', points: 10, minPercent: 75 },
      { grade: 'A+', points: 9, minPercent: 70 },
      { grade: 'A', points: 8, minPercent: 65 },
      { grade: 'B+', points: 7, minPercent: 60 },
      { grade: 'B', points: 6, minPercent: 55 },
      { grade: 'C', points: 5, minPercent: 50 },
      { grade: 'P', points: 4, minPercent: 40 },
    ]);
    // A weak class: cut-offs below the pass mark are raised to it.
    const weak = relativeCuts({ candidates: 40, mean: 42, sd: 8 }, DEFAULT_RELATIVE.bands, 40);
    expect(weak.map((c) => c.minPercent)).toEqual([54, 50, 46, 42, 40, 40, 40]);
  });

  it('moves every cut-off by the moderation shift and keeps them within 0-100', () => {
    const cuts = relativeCuts({ candidates: 40, mean: 92, sd: 6 }, DEFAULT_RELATIVE.bands, 40, -2);
    expect(cuts[0]).toEqual({ grade: 'O', points: 10, minPercent: 99 });
    const capped = relativeCuts({ candidates: 40, mean: 95, sd: 6 }, DEFAULT_RELATIVE.bands, 40);
    expect(capped[0].minPercent).toBe(100);
  });

  it('grades a passing candidate on the curve and counts the distribution', () => {
    const cuts = relativeCuts({ candidates: 40, mean: 60, sd: 10 }, DEFAULT_RELATIVE.bands, 40);
    expect(gradeOnCurve(76, cuts)).toEqual({ grade: 'O', gradePoint: 10 });
    expect(gradeOnCurve(61, cuts)).toEqual({ grade: 'B+', gradePoint: 7 });
    expect(gradeOnCurve(41, cuts)).toEqual({ grade: 'P', gradePoint: 4 });
    expect(distribution(['O', 'B+', 'B+', 'F'], ['O', 'B+', 'P'])).toEqual([
      { grade: 'O', count: 1 },
      { grade: 'B+', count: 2 },
      { grade: 'P', count: 0 },
      { grade: 'F', count: 1 },
    ]);
  });
});
