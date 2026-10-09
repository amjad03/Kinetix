import { describe, expect, it } from 'vitest';
import { decidePromotion, evaluateBoardPass, masteryFromLevel, masteryFromPct, readiness, recommend } from './school-rules.js';

const rule = { minAttendancePct: 75, subjectPassPct: 35, maxCompartmentSubjects: 2, graceMarks: 3 };

describe('promotion rules', () => {
  const ok = [{ subject: 'Maths', pct: 70 }, { subject: 'Science', pct: 55 }];
  it('promotes when every subject passes and attendance is enough', () => {
    expect(decidePromotion(rule, 90, ok)).toMatchObject({ decision: 'promoted', failedSubjects: [] });
  });
  it('uses grace marks only for a subject that is just short', () => {
    const out = decidePromotion(rule, 90, [...ok, { subject: 'Hindi', pct: 33 }]);
    expect(out).toMatchObject({ decision: 'promoted_with_grace', graceSubjects: ['Hindi'] });
    expect(decidePromotion(rule, 90, [...ok, { subject: 'Hindi', pct: 30 }])).toMatchObject({ decision: 'compartment', failedSubjects: ['Hindi'] });
  });
  it('gives a compartment chance up to the limit, then detains', () => {
    const three = [{ subject: 'A', pct: 10 }, { subject: 'B', pct: 12 }, { subject: 'C', pct: 20 }];
    expect(decidePromotion(rule, 90, three.slice(0, 2)).decision).toBe('compartment');
    expect(decidePromotion(rule, 90, three)).toMatchObject({ decision: 'detained', failedSubjects: ['A', 'B', 'C'] });
  });
  it('detains on attendance whatever the marks, and says why', () => {
    const out = decidePromotion(rule, 60, ok);
    expect(out.decision).toBe('detained');
    expect(out.reasons[0]).toContain('60%');
    expect(decidePromotion(rule, null, ok).decision).toBe('promoted');
  });
});

describe('board pass rules', () => {
  const marks = [
    { subject: 'Physics', theory: 52, theoryMax: 70, practical: 24, practicalMax: 30 },
    { subject: 'English', theory: 27, theoryMax: 80, internal: 6, internalMax: 20 },
    { subject: 'Maths', theory: 20, theoryMax: 100 },
  ];
  it('applies the subject minimum, grace marks and the aggregate', () => {
    const r = evaluateBoardPass({ subjectPassPct: 35, graceMarks: 2, maxCompartmentSubjects: 1 }, marks);
    // English is 33/100 and needs 35: two grace marks lift it; Maths 20/100 fails.
    expect(r.graceUsed).toEqual([{ subject: 'English', marks: 2 }]);
    expect(r.failedSubjects).toEqual(['Maths']);
    expect(r.result).toBe('compartment');
    expect(evaluateBoardPass({ subjectPassPct: 35 }, marks).result).toBe('fail');
    expect(evaluateBoardPass({ subjectPassPct: 35, aggregatePassPct: 90 }, marks.slice(0, 1)).result).toBe('fail');
    expect(evaluateBoardPass({ subjectPassPct: 35 }, marks.slice(0, 1)).result).toBe('pass');
  });
  it('can require theory and practical to pass separately', () => {
    const r = evaluateBoardPass({ subjectPassPct: 35, practicalSeparate: true }, [{ subject: 'Physics', theory: 20, theoryMax: 70, practical: 29, practicalMax: 30 }]);
    expect(r.failedSubjects).toEqual(['Physics']);
  });
});

describe('mastery from activity results', () => {
  it('maps a percentage and a level scale to the four mastery levels', () => {
    expect([90, 70, 50, 10].map(masteryFromPct)).toEqual(['mastery', 'proficient', 'developing', 'beginning']);
    const levels = ['Mastered', 'Secure', 'Developing', 'Beginning'];
    expect(levels.map((l) => masteryFromLevel(levels, l))).toEqual(['mastery', 'proficient', 'developing', 'beginning']);
    expect(masteryFromLevel(['Done'], 'Done')).toBe('mastery');
    expect(masteryFromLevel(levels, 'Unknown')).toBeNull();
  });
});

describe('entrance readiness', () => {
  const mock = (takenOn: string, score: number, breakdown: Record<string, number> = {}) => ({ takenOn, score, maxScore: 100, breakdown });
  it('averages the last three mocks against the target and names weak subjects', () => {
    const r = readiness([mock('2026-08-01', 40), mock('2026-09-01', 55), mock('2026-10-01', 65, { Physics: 52, Maths: 78 }), mock('2026-10-20', 70, { Physics: 55, Maths: 85 })], 70);
    expect(r).toMatchObject({ latestPct: 70, averagePct: 63.3, band: 'close', trend: 'up', tests: 4 });
    expect(r.weakSubjects).toEqual(['Physics']);
    expect(readiness([], 70).band).toBe('no_data');
    expect(readiness([mock('2026-10-01', 80)], 70)).toMatchObject({ band: 'on_track', trend: null });
    expect(readiness([mock('2026-10-01', 30)], 70).band).toBe('behind');
  });
});

describe('recommendations', () => {
  it('puts items that teach the weakest outcomes first, then overdue work', () => {
    const out = recommend({
      weakOutcomes: [{ outcomeId: 'o1', code: 'M6.1', level: 'developing', topicIds: ['t1'] }, { outcomeId: 'o2', code: 'M6.2', level: 'beginning', topicIds: ['t2'] }],
      items: [{ id: 'i1', title: 'Fractions', kind: 'topic', topicId: 't1', courseId: 'c' }, { id: 'i2', title: 'Ratios', kind: 'topic', topicId: 't2', courseId: 'c' }, { id: 'i3', title: 'Geometry', kind: 'topic', topicId: 't9', courseId: 'c' }],
      overdue: [{ id: 'h1', title: 'Homework 4', dueOn: '2026-10-01' }],
    });
    expect(out.map((o) => o.id)).toEqual(['i2', 'i1', 'h1']);
    expect(out[0].reason).toContain('M6.2');
  });
});
