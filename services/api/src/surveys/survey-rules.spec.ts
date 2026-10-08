import { describe, expect, it } from 'vitest';
import { acceptsAnswers, checkAnswers, inAudience, questionProblem, summarize, type QuestionDef, type Respondent } from './survey-rules.js';

const qs: QuestionDef[] = [
  { id: 'q1', kind: 'single', prompt: 'Pace', options: ['Slow', 'Right', 'Fast'], required: true },
  { id: 'q2', kind: 'multiple', prompt: 'Helpful', options: ['Notes', 'Labs'], required: false },
  { id: 'q3', kind: 'rating', prompt: 'Overall', options: [], required: true },
  { id: 'q4', kind: 'text', prompt: 'Comments', options: [], required: false },
];
const who = (o: Partial<Respondent>): Respondent => ({ roles: [], studentSectionId: null, isStudent: false, isGuardian: false, ...o });

describe('audience', () => {
  it('matches each audience to the right people', () => {
    expect(inAudience({ audience: 'students', sectionId: null }, who({ roles: ['student'], isStudent: true }))).toBe(true);
    expect(inAudience({ audience: 'students', sectionId: null }, who({ roles: ['teacher'] }))).toBe(false);
    expect(inAudience({ audience: 'section', sectionId: 's1' }, who({ roles: ['student'], isStudent: true, studentSectionId: 's1' }))).toBe(true);
    expect(inAudience({ audience: 'section', sectionId: 's1' }, who({ roles: ['student'], isStudent: true, studentSectionId: 's2' }))).toBe(false);
    expect(inAudience({ audience: 'guardians', sectionId: null }, who({ roles: ['guardian'], isGuardian: true }))).toBe(true);
    expect(inAudience({ audience: 'staff', sectionId: null }, who({ roles: ['teacher'] }))).toBe(true);
    expect(inAudience({ audience: 'staff', sectionId: null }, who({ roles: ['student'], isStudent: true }))).toBe(false);
  });
});

describe('answer window', () => {
  const s = { status: 'open', opensAt: new Date('2026-10-10T00:00:00Z'), closesAt: new Date('2026-10-20T00:00:00Z') };
  it('accepts answers only inside the window of an open survey', () => {
    expect(acceptsAnswers(s, new Date('2026-10-15T00:00:00Z'))).toBe(true);
    expect(acceptsAnswers(s, new Date('2026-10-09T00:00:00Z'))).toBe(false);
    expect(acceptsAnswers(s, new Date('2026-10-20T00:00:00Z'))).toBe(false);
    expect(acceptsAnswers({ ...s, status: 'closed' }, new Date('2026-10-15T00:00:00Z'))).toBe(false);
    expect(acceptsAnswers({ status: 'open', opensAt: null, closesAt: null }, new Date())).toBe(true);
  });
});

describe('question definitions', () => {
  it('needs two distinct options for a choice question and none otherwise', () => {
    expect(questionProblem({ kind: 'single', options: ['A'] })).toMatch(/two options/);
    expect(questionProblem({ kind: 'multiple', options: ['A', 'A'] })).toMatch(/different/);
    expect(questionProblem({ kind: 'single', options: ['A', 'B'] })).toBeNull();
    expect(questionProblem({ kind: 'rating', options: ['A'] })).toMatch(/Only choice/);
    expect(questionProblem({ kind: 'text', options: [] })).toBeNull();
  });
});

describe('checking answers', () => {
  it('accepts a complete submission and skips optional blanks', () => {
    const r = checkAnswers(qs, [{ questionId: 'q1', choices: ['Right'] }, { questionId: 'q3', rating: 4 }]);
    expect(r.ok && r.answers.length).toBe(2);
  });
  it('rejects missing required, bad options, bad ratings and repeats', () => {
    expect(checkAnswers(qs, [{ questionId: 'q3', rating: 4 }]).ok).toBe(false);
    expect(checkAnswers(qs, [{ questionId: 'q1', choices: ['Other'] }, { questionId: 'q3', rating: 4 }]).ok).toBe(false);
    expect(checkAnswers(qs, [{ questionId: 'q1', choices: ['Slow', 'Fast'] }, { questionId: 'q3', rating: 4 }]).ok).toBe(false);
    expect(checkAnswers(qs, [{ questionId: 'q1', choices: ['Slow'] }, { questionId: 'q3', rating: 6 }]).ok).toBe(false);
    expect(checkAnswers(qs, [{ questionId: 'q1', choices: ['Slow'] }, { questionId: 'q1', choices: ['Fast'] }, { questionId: 'q3', rating: 3 }]).ok).toBe(false);
    expect(checkAnswers(qs, [{ questionId: 'nope', text: 'x' }]).ok).toBe(false);
  });
});

describe('summary', () => {
  it('counts options, averages ratings and lists text', () => {
    const out = summarize(qs, [
      { questionId: 'q1', choices: ['Right'], rating: null, text: null },
      { questionId: 'q1', choices: ['Right'], rating: null, text: null },
      { questionId: 'q1', choices: ['Fast'], rating: null, text: null },
      { questionId: 'q3', choices: [], rating: 5, text: null },
      { questionId: 'q3', choices: [], rating: 4, text: null },
      { questionId: 'q4', choices: [], rating: null, text: 'Good' },
    ]);
    expect(out[0].counts).toEqual([{ option: 'Slow', count: 0 }, { option: 'Right', count: 2 }, { option: 'Fast', count: 1 }]);
    expect(out[2].average).toBe(4.5);
    expect(out[2].distribution).toEqual([0, 0, 0, 1, 1]);
    expect(out[3].texts).toEqual(['Good']);
    expect(out[1].answered).toBe(0);
  });
});
