import { describe, expect, it } from 'vitest';
import { currentStage, DEFAULT_SETTINGS, examFee, formatSeries, moderate, moderationProblem, passStats, revalFee, stageBlocker, stageStates, withDefaults, type StageFacts } from './exam-office.logic.js';

const facts = (f: Partial<StageFacts> = {}): StageFacts => ({ papers: 2, hasWindow: true, registrations: 3, feeDues: 3, feeOpen: 0, tickets: 3, papersHeld: 2, papersWithAttendance: 2, scripts: 0, scriptsOpen: 0, moderationsOpen: 0, status: 'scheduled', approvalRequired: false, approved: false, revaluationsOpen: 0, ...f });

describe('exam office rules', () => {
  it('blocks a stage until its check passes', () => {
    expect(stageBlocker('setup', facts({ papers: 0 }))).toMatch(/paper/);
    expect(stageBlocker('fees', facts({ feeDues: 0 }))).toMatch(/Raise/);
    expect(stageBlocker('fees', facts({ feeOpen: 2 }))).toMatch(/2 candidate/);
    expect(stageBlocker('conduct', facts({ papersWithAttendance: 1 }))).toMatch(/1 of 2/);
    expect(stageBlocker('result_approval', facts({ status: 'processed', approvalRequired: true }))).toMatch(/approval/);
    expect(stageBlocker('result_approval', facts({ status: 'processed', approvalRequired: true, approved: true }))).toBeNull();
    expect(stageBlocker('published', facts({ status: 'published' }))).toBeNull();
  });

  it('finds the current stage; publishing closes the result steps even without a log entry', () => {
    const rows = ['setup', 'timetable'].map((stage) => ({ stage, status: 'done', actor: null, note: null, at: null }));
    expect(currentStage(rows, { status: 'scheduled', approved: false })).toBe('registration');
    const pending = [...rows.slice(0, 1), { stage: 'timetable', status: 'pending', actor: 'A', note: null, at: null }];
    expect(stageStates(pending, { status: 'draft', approved: false })[1]).toMatchObject({ state: 'current', pending: true });
    const states = stageStates(rows, { status: 'published', approved: false });
    expect(states.find((x) => x.stage === 'published')!.state).toBe('done');
    expect(states.find((x) => x.stage === 'result_approval')!.state).toBe('done');
  });

  it('formats numbering series with the calendar and financial year', () => {
    const d = new Date('2026-11-01T00:00:00Z');
    expect(formatSeries({ prefix: 'HT/{YYYY}/', next: 1, pad: 5, suffix: '' }, 42, d)).toBe('HT/2026/00042');
    expect(formatSeries({ prefix: 'CERT/{FY}/', next: 1, pad: 4, suffix: '-D' }, 7, new Date('2027-02-01T00:00:00Z'))).toBe('CERT/2026-27/0007-D');
  });

  it('fills stored settings over the defaults and prices fees and revaluation', () => {
    const s = withDefaults({ examFees: { perPaperPaise: 20_000 }, junk: 1 });
    expect(s.examFees).toEqual({ ...DEFAULT_SETTINGS.examFees, perPaperPaise: 20_000 });
    expect(examFee(s.examFees, 1, false, false)).toBe(50_000);
    expect(examFee(s.examFees, 4, false, true)).toBe(100_000);
    expect(examFee(s.examFees, 2, true, false)).toBe(50_000);
    expect(revalFee(s.revaluation, 'photocopy')).toBe(30_000);
  });

  it('moderates within limits, never above the maximum or for an absentee', () => {
    expect(moderate(40, 'add', 3, 60)).toBe(43);
    expect(moderate(59, 'add', 3, 60)).toBe(60);
    expect(moderate(50, 'scale', 10, 100)).toBe(55);
    expect(moderate(null, 'add', 3, 60)).toBeNull();
    expect(moderationProblem(DEFAULT_SETTINGS.moderation, 'add', 9)).toMatch(/At most 5/);
    expect(moderationProblem(DEFAULT_SETTINGS.moderation, 'scale', 0)).toMatch(/raise/);
    expect(moderationProblem(DEFAULT_SETTINGS.moderation, 'scale', 8)).toBeNull();
  });

  it('summarises pass statistics', () => {
    expect(passStats([{ percent: 80, passed: true }, { percent: 30, passed: false }])).toEqual({ appeared: 2, passed: 1, failed: 1, passPercent: 50, mean: 55, highest: 80 });
    expect(passStats([])).toMatchObject({ appeared: 0, passPercent: 0 });
  });
});
