import { describe, expect, it } from 'vitest';
import {
  activeFlows, audienceRule, dataUrlBase64, downloadPath, fileProblem, keepDays, MEDIA_TYPES, parseIds, parseParticipants, parseSurveyQuestions, parseVars, placeholdersOf, simpleFlowBody, sizeLabel, trendCell,
} from './pathways-b';

describe('files', () => {
  it('refuses empty, big and unknown files', () => {
    expect(fileProblem({ name: 'a.pdf', type: 'application/pdf', size: 1200 })).toBeNull();
    expect(fileProblem({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toBe('empty');
    expect(fileProblem({ name: 'a.pdf', type: 'application/pdf', size: 4_000_001 })).toBe('size');
    expect(fileProblem({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).toBe('type');
    expect(fileProblem({ name: 'a.pdf', type: 'application/pdf', size: 10 }, MEDIA_TYPES)).toBe('type');
    expect(fileProblem({ name: 'a.mp4', type: 'video/mp4', size: 10 }, MEDIA_TYPES)).toBeNull();
  });
  it('takes the base64 part of a data URL and words sizes', () => {
    expect(dataUrlBase64('data:image/png;base64,QUJD')).toBe('QUJD');
    expect(sizeLabel(12)).toBe('12 B');
    expect(sizeLabel(320_000)).toBe('320 KB');
    expect(sizeLabel(1_500_000)).toBe('1.5 MB');
  });
  it('builds download paths', () => {
    expect(downloadPath('report-pack', 'abc', { from: '2026-01-01', to: '2026-03-31' })).toBe('/api/download?kind=report-pack&id=abc&from=2026-01-01&to=2026-03-31');
  });
});

describe('participants', () => {
  const roster = [{ studentId: 's1', fullName: 'Asha Rao', rollNo: '12' }];
  it('links names that match a club member', () => {
    expect(parseParticipants('Asha Rao\n\nrohan (guest)\nasha rao (12)', roster)).toEqual({
      ok: true,
      participants: [{ studentId: 's1', name: 'Asha Rao' }, { name: 'rohan (guest)' }, { studentId: 's1', name: 'Asha Rao' }],
    });
  });
  it('allows thirty people at most', () => {
    const many = Array.from({ length: 31 }, (_, i) => `P${i}`).join('\n');
    expect(parseParticipants(many, [])).toEqual({ ok: false, line: 31 });
  });
});

describe('survey questions with conditions', () => {
  it('reads a condition at the end of a line', () => {
    const r = parseSurveyQuestions('single: How is the pace? | Slow; Right; Fast\ntext: Why is it slow? @if 1 eq Slow\nrating: Rate the course\ntext?: What went wrong? @if 3 lte 2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questions[0].showIf).toBeUndefined();
    expect(r.questions[1].showIf).toEqual({ ord: 1, op: 'eq', value: 'Slow' });
    expect(r.questions[1].prompt).toBe('Why is it slow?');
    expect(r.questions[3].showIf).toEqual({ ord: 3, op: 'lte', value: 2 });
    expect(r.questions[3].required).toBe(false);
  });
  it('refuses a condition on a later question, or a number test without a number', () => {
    expect(parseSurveyQuestions('text: First one @if 1 eq x')).toEqual({ ok: false, line: 1 });
    expect(parseSurveyQuestions('rating: Rate it\ntext: Why not? @if 1 gte high')).toEqual({ ok: false, line: 2 });
    expect(parseSurveyQuestions('')).toEqual({ ok: false, line: 1 });
  });
  it('still reports the line of an unreadable question', () => {
    expect(parseSurveyQuestions('rating: Rate it\nwhat is this')).toEqual({ ok: false, line: 2 });
  });
});

describe('trend table cell', () => {
  it('shows the average, or the most chosen option', () => {
    expect(trendCell({ cycle: 1, surveyId: 'a', answered: 4, average: 3.5, counts: null })).toBe('3.5');
    expect(trendCell({ cycle: 1, surveyId: 'a', answered: 4, average: null, counts: [{ option: 'Slow', count: 1 }, { option: 'Right', count: 3 }] })).toBe('Right (3)');
    expect(trendCell(undefined)).toBe('-');
    expect(trendCell({ cycle: 2, surveyId: 'b', answered: 0, average: null, counts: [] })).toBe('-');
  });
});

describe('retention', () => {
  it('keeps between 30 days and ten years', () => {
    expect(keepDays('365')).toBe(365);
    expect(keepDays(' 30 ')).toBe(30);
    expect(keepDays('29')).toBeNull();
    expect(keepDays('3651')).toBeNull();
    expect(keepDays('1.5')).toBeNull();
    expect(keepDays('')).toBeNull();
  });
});

describe('communication', () => {
  it('reads ids and refuses a bad one', () => {
    const a = '3f2b6c1e-8a4d-4e0f-9b7a-1c2d3e4f5a6b';
    expect(parseIds(`${a}, ${a}\n`)).toEqual({ ok: true, ids: [a] });
    expect(parseIds('')).toEqual({ ok: true, ids: [] });
    expect(parseIds(`${a} nope`)).toEqual({ ok: false, bad: 'nope' });
  });
  it('reads name=value lines', () => {
    expect(parseVars('name=Asha\n\namount = Rs 500 = due')).toEqual({ ok: true, vars: { name: 'Asha', amount: 'Rs 500 = due' } });
    expect(parseVars('name Asha')).toEqual({ ok: false, line: 1 });
    expect(parseVars('=x')).toEqual({ ok: false, line: 1 });
  });
  it('finds the marks a message fills in', () => {
    expect(placeholdersOf('Dear {{ name }}, {{amount}} is due. {{name}}')).toEqual(['name', 'amount']);
  });
  it('builds an audience rule only when it names somebody', () => {
    expect(audienceRule([], [], [])).toBeNull();
    expect(audienceRule(['guardian'], [], [])).toEqual({ roles: ['guardian'] });
    expect(audienceRule(['guardian'], ['sec'], ['u'])).toEqual({ roles: ['guardian'], sectionIds: ['sec'], userIds: ['u'] });
  });
});

describe('approval flows', () => {
  it('lists which of the five flows are active', () => {
    expect(activeFlows([{ requestType: 'fee_refund', active: true }, { requestType: 'scholarship_award', active: false }, { requestType: 'leave', active: true }])).toEqual({
      scholarship_award: false, fee_refund: true, certificate_issue: false, admission_fee_waiver: false, grievance_resolution: false,
    });
  });
  it('makes a one-step definition', () => {
    expect(simpleFlowBody('fee_refund', ' Fee refund ', 'principal')).toMatchObject({ requestType: 'fee_refund', name: 'Fee refund', active: true, steps: [{ name: 'Approval', approver: { kind: 'role', role: 'principal' } }] });
  });
});
