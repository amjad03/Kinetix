import { describe, expect, it } from 'vitest';
import { canSee, sectionOf } from './access';
import { draftFrom, draftTotal, entriesFrom, missingMarks, type MarkDraft } from './evaluation-desk';
import { outcomeTag, parseQuestions, resolveOutcomes, type SurveyOutcome } from './work';

const qs = [
  { id: 'q1', no: '1', maxMarks: 10 },
  { id: 'q2', no: '2', maxMarks: 5 },
];

describe('examiner desk marks', () => {
  it('turns typed marks into entries and totals them', () => {
    const d: MarkDraft = { q1: { marks: '7.5', comment: ' good ' }, q2: { marks: '0', comment: '' } };
    const r = entriesFrom(d, qs);
    expect(r).toEqual({ ok: true, entries: [{ questionId: 'q1', marks: 7.5, comment: 'good' }, { questionId: 'q2', marks: 0 }] });
    expect(draftTotal(d, qs)).toBe(7.5);
    expect(missingMarks(d, qs)).toBe(0);
  });

  it('flags the first mark that is not a number within the maximum', () => {
    expect(entriesFrom({ q1: { marks: '11', comment: '' } }, qs)).toEqual({ ok: false, bad: 'q1' });
    expect(entriesFrom({ q2: { marks: 'abc', comment: '' } }, qs)).toEqual({ ok: false, bad: 'q2' });
    expect(entriesFrom({ q2: { marks: '-1', comment: '' } }, qs)).toEqual({ ok: false, bad: 'q2' });
  });

  it('counts blank questions and starts from what was saved', () => {
    const d = draftFrom({ entries: [{ questionId: 'q1', marks: 4, comment: null }] });
    expect(d).toEqual({ q1: { marks: '4', comment: '' } });
    expect(missingMarks(d, qs)).toBe(1);
  });

  it('opens /evaluation/desk to heads of department and the principal, not the exam office page', () => {
    expect(sectionOf('/evaluation/desk')).toBe('evaluationDesk');
    expect(sectionOf('/evaluation')).toBe('evaluation');
    expect(canSee(['hod'], 'evaluationDesk')).toBe(true);
    expect(canSee(['hod'], 'evaluation')).toBe(false);
    expect(canSee(['accountant'], 'evaluationDesk')).toBe(false);
  });
});

describe('survey questions tied to course outcomes', () => {
  const outcomes: SurveyOutcome[] = [
    { id: 'o1', code: 'CO1', statement: 'Explain', subjectCode: 'CS101', subjectName: 'Intro' },
    { id: 'o2', code: 'CO1', statement: 'Apply', subjectCode: 'MA101', subjectName: 'Maths' },
    { id: 'o3', code: 'CO2', statement: 'Design', subjectCode: 'CS101', subjectName: 'Intro' },
  ];

  it('reads an outcome tag on a rating line', () => {
    const p = parseQuestions('rating@CS101/CO2: Rate the labs\ntext: Comments');
    expect(p).toEqual({ ok: true, questions: [{ kind: 'rating', prompt: 'Rate the labs', options: [], required: true, coTag: 'CS101/CO2' }, { kind: 'text', prompt: 'Comments', options: [], required: true }] });
    expect(parseQuestions('text@CO1: Comments')).toEqual({ ok: false, line: 1 });
  });

  it('resolves tags, falls back to the picked outcome and refuses unknown or ambiguous ones', () => {
    expect(outcomeTag(outcomes[0])).toBe('CS101/CO1');
    const p = parseQuestions('rating@CS101/CO2: A question\nrating: Another one\ntext: Free text');
    if (!p.ok) throw new Error('parse');
    const r = resolveOutcomes(p.questions, outcomes, 'o2');
    expect(r.ok && r.questions.map((q) => (q as { coId?: string }).coId)).toEqual(['o3', 'o2', undefined]);
    const amb = parseQuestions('rating@CO1: Which one');
    if (!amb.ok) throw new Error('parse');
    expect(resolveOutcomes(amb.questions, outcomes)).toEqual({ ok: false, tag: 'CO1' });
    const unknown = parseQuestions('rating@XX9/CO1: Nope');
    if (!unknown.ok) throw new Error('parse');
    expect(resolveOutcomes(unknown.questions, outcomes)).toEqual({ ok: false, tag: 'XX9/CO1' });
  });
});
