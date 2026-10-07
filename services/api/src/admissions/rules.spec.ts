import { ageOn, canMoveApplication, canMoveEnquiry, eligibilityFailures, meritScore, rankMerit, transitionProblem, validateAnswers, type AdmissionFormField } from '@kinetix/shared';
import { describe, expect, it } from 'vitest';
import { configProblems } from './admissions.service.js';

const fields: AdmissionFormField[] = [
  { key: 'marks', label: 'Marks', type: 'number', required: true, min: 0, max: 100 },
  { key: 'stream', label: 'Stream', type: 'select', required: false, options: ['Commerce', 'Science'] },
  { key: 'mail', label: 'Email', type: 'email', required: false },
];

describe('admissions rules', () => {
  it('validates answers against the per-program form', () => {
    expect(validateAnswers(fields, { marks: 80, stream: 'Commerce' })).toEqual({});
    expect(validateAnswers(fields, {})).toEqual({ marks: 'Required' });
    expect(validateAnswers(fields, { marks: 101, stream: 'Arts', mail: 'x', extra: 1 })).toEqual({ marks: 'At most 100', stream: 'Choose one of the options', mail: 'Enter an email address', extra: 'Not a question on this form' });
  });

  it('computes age on a day and checks eligibility', () => {
    expect(ageOn('2008-03-10', '2026-03-09')).toBe(17);
    expect(ageOn('2008-03-10', '2026-03-10')).toBe(18);
    const rules = { minAge: 17, maxAge: 20, minimums: [{ field: 'marks', min: 50 }], allowed: [{ field: 'stream', values: ['Commerce'] }] };
    expect(eligibilityFailures(rules, { dateOfBirth: '2008-03-10', answers: { marks: 60, stream: 'Commerce' } }, '2026-06-01')).toEqual([]);
    expect(eligibilityFailures(rules, { dateOfBirth: '2012-01-01', answers: { marks: 40, stream: 'Arts' } }, '2026-06-01')).toEqual(['Younger than 17', 'marks below 50', 'stream not accepted']);
    expect(eligibilityFailures(rules, { dateOfBirth: null, answers: { marks: 60, stream: 'Commerce' } }, '2026-06-01')).toEqual(['Date of birth is missing']);
  });

  it('scores and ranks by merit; ties go to the earlier application', () => {
    expect(meritScore([{ field: 'marks', weight: 0.7 }, { field: 'entrance', weight: 0.3 }], { marks: 80, entrance: 50 })).toBe(71);
    expect(meritScore([{ field: 'marks', weight: 1 }], {})).toBe(0);
    const r = rankMerit([{ id: 'b', score: 70, submittedAt: '2026-01-02' }, { id: 'a', score: 70, submittedAt: '2026-01-01' }, { id: 'c', score: 90, submittedAt: '2026-01-03' }], 2);
    expect(r.map((x) => [x.id, x.rank, x.decision])).toEqual([['c', 1, 'offer'], ['a', 2, 'offer'], ['b', 3, 'waitlist']]);
  });

  it('only allows the documented moves', () => {
    expect(canMoveApplication('submitted', 'under_review')).toBe(true);
    expect(canMoveApplication('submitted', 'offered')).toBe(false);
    expect(canMoveApplication('enrolled', 'withdrawn')).toBe(false);
    expect(canMoveEnquiry('new', 'contacted')).toBe(true);
    expect(canMoveEnquiry('converted', 'lost')).toBe(false);
    expect(transitionProblem('active', 'dropped', { finalTerm: false })).toBe('Give a reason for this change');
    expect(transitionProblem('active', 'dropped', { reason: 'moved away', finalTerm: false })).toBeNull();
    expect(transitionProblem('active', 'alumni', { finalTerm: false })).toMatch(/final term/);
    expect(transitionProblem('active', 'promoted', { finalTerm: true })).toMatch(/graduate/);
    expect(transitionProblem('alumni', 'active', { finalTerm: true })).toMatch(/cannot become/);
  });

  it('rejects cycle configurations whose rules name missing questions', () => {
    const cfg = { formFields: fields, documents: [], eligibility: {}, meritRules: [] };
    expect(configProblems(cfg)).toEqual([]);
    expect(configProblems({ ...cfg, meritRules: [{ field: 'stream', weight: 1 }], eligibility: { minimums: [{ field: 'nope', min: 1 }] } })).toEqual(['Eligibility: nope is not a number question', 'Merit: stream is not a number question']);
    expect(configProblems({ ...cfg, formFields: [...fields, { ...fields[0] }] })).toEqual(['Two questions share a key']);
  });
});
