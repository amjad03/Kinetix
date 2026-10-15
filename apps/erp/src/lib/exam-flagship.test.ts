import { describe, expect, it } from 'vitest';
import { isCellPath } from './exam-cell';
import { chosenRepeats, feeFor, registerHref, rupees, spread, type ApplicationView } from './exam-flagship';

const ID = '11111111-2222-4333-8444-555555555555';
const S2 = '66666666-2222-4333-8444-555555555555';

function view(over: Partial<ApplicationView['fee']> = {}): ApplicationView {
  const sub = (subjectId: string, kind: 'regular' | 'backlog' | 'improvement', eligible: boolean, feePaise: number, chosen: boolean) => ({ subjectId, code: subjectId.slice(0, 4), name: 'x', credits: 4, kind, eligible, reasons: [], feePaise, failedInSessionId: null, chosen, examDate: null, startsAt: null });
  return {
    session: { id: ID, name: 'S', kind: 'supplementary', status: 'scheduled', startsOn: '2027-01-18', endsOn: '2027-01-25' },
    student: { id: ID, name: 'A', rollNo: 'R1', section: 'A' },
    window: null,
    rules: { minAttendancePercent: 75, condonableToPercent: null, internalEligibilityPercent: null, basis: 'per_subject', source: 'tenant' },
    blockers: [],
    subjects: [sub('reg1', 'regular', true, 15_000, true), sub('bak1', 'backlog', true, 25_000, false), sub('imp1', 'improvement', true, 25_000, true), sub('bad1', 'backlog', false, 25_000, false)],
    fee: { papersPaise: 0, topUpPaise: 0, lateFeePaise: 0, totalPaise: 0, papers: 0, lateSlab: null, minimumPaise: 50_000, ...over },
    application: null,
    canSubmit: true,
  };
}

describe('exam applications in the ERP', () => {
  it('works out the fee of a choice the way the API does (worked by hand)', () => {
    // 150 (this term) only: raised to the 500 minimum.
    expect(feeFor(view(), new Set())).toBe(50_000);
    // 150 + 250 + 250 = 650: above the minimum.
    expect(feeFor(view(), new Set(['bak1', 'imp1']))).toBe(65_000);
    // An ineligible subject costs nothing; the late fee is added on top.
    expect(feeFor(view({ lateFeePaise: 20_000 }), new Set(['bad1']))).toBe(70_000);
  });

  it('keeps only the chosen repeat papers', () => {
    expect(chosenRepeats(view())).toEqual(['imp1']);
  });

  it('formats coverage, money and register links', () => {
    expect(spread({ CO2: 8, CO1: 6 })).toBe('CO1 6 · CO2 8');
    expect(rupees(50_000)).toBe('500.00');
    expect(registerHref('exam-attendance-sheet', ID, S2, ID)).toBe(`/api/download?kind=exam-attendance-sheet&id=${ID}&paper=${S2}&room=${ID}`);
    expect(registerHref('exam-tabulation', ID)).toBe(`/api/download?kind=exam-tabulation&id=${ID}`);
  });

  it('lets the desk reach only the application, paper setting and unlock endpoints', () => {
    expect(isCellPath(`/v1/exam-sessions/${ID}/application`)).toBe(true);
    expect(isCellPath(`/v1/exam-sessions/${ID}/application/${S2}/withdraw`)).toBe(true);
    expect(isCellPath(`/v1/exam-sessions/${ID}/subjects/${S2}/draw`)).toBe(true);
    expect(isCellPath(`/v1/qp-appointments/${ID}/cancel`)).toBe(true);
    expect(isCellPath(`/v1/marks-unlock-requests/${ID}/decide`)).toBe(true);
    expect(isCellPath(`/v1/exam-sessions/${ID}/application/${S2}`)).toBe(false);
    expect(isCellPath(`/v1/fees/invoices/${ID}/payments`)).toBe(false);
  });
});
