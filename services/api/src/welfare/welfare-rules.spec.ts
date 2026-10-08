import { describe, expect, it } from 'vitest';
import { approvedAmountOk, canAdvanceStage, canMoveTicket, canMoveWelfare, canReopen, committeeFor, effectiveSeverity, escalate, isOverdue, needsPrincipal, slaDueAt, withinAppealWindow } from './welfare-rules.js';

const t0 = new Date('2026-10-20T04:30:00Z');
const hours = (n: number) => new Date(t0.getTime() + n * 3_600_000);

describe('committee routing', () => {
  it('routes ragging and harassment to a committee and nothing else', () => {
    expect(committeeFor('ragging')).toBe('anti_ragging');
    expect(committeeFor('harassment')).toBe('icc');
    expect(committeeFor('harassment', 'posh')).toBe('posh');
    expect(committeeFor('fees')).toBeNull();
  });
  it('never lets a committee matter be low severity', () => {
    expect(effectiveSeverity('ragging', 'low')).toBe('high');
    expect(effectiveSeverity('ragging', 'critical')).toBe('critical');
    expect(effectiveSeverity('fees', 'low')).toBe('low');
  });
});

describe('SLA and escalation', () => {
  it('sets deadlines by severity', () => {
    expect(slaDueAt(t0, 'critical')).toEqual(hours(24));
    expect(slaDueAt(t0, 'medium')).toEqual(hours(120));
  });
  it('is overdue only when open, past due and below the top level', () => {
    const base = { status: 'open', slaDueAt: hours(1), escalationLevel: 0 };
    expect(isOverdue(base, hours(2))).toBe(true);
    expect(isOverdue(base, hours(0))).toBe(false);
    expect(isOverdue({ ...base, status: 'resolved' }, hours(2))).toBe(false);
    expect(isOverdue({ ...base, escalationLevel: 2 }, hours(2))).toBe(false);
  });
  it('gives the next level half the SLA, at least a day', () => {
    expect(escalate({ escalationLevel: 0, severity: 'medium' }, t0)).toEqual({ level: 1, dueAt: hours(60) });
    expect(escalate({ escalationLevel: 1, severity: 'critical' }, t0)).toEqual({ level: 2, dueAt: hours(24) });
  });
  it('guards ticket moves and reopening', () => {
    expect(canMoveTicket('open', 'resolved')).toBe(true);
    expect(canMoveTicket('closed', 'open')).toBe(false);
    expect(canMoveTicket('resolved', 'reopened')).toBe(true);
    expect(canReopen(hours(-24 * 6), t0)).toBe(true);
    expect(canReopen(hours(-24 * 8), t0)).toBe(false);
    expect(canReopen(null, t0)).toBe(false);
  });
});

describe('committee stages, appeals and welfare', () => {
  it('advances in order and lets the hearing be skipped', () => {
    expect(canAdvanceStage('received', 'inquiry')).toBe(true);
    expect(canAdvanceStage('inquiry', 'report')).toBe(true);
    expect(canAdvanceStage('received', 'report')).toBe(false);
    expect(canAdvanceStage('report', 'inquiry')).toBe(false);
  });
  it('allows appeals for 15 days', () => {
    expect(withinAppealWindow(hours(-24 * 15), t0)).toBe(true);
    expect(withinAppealWindow(hours(-24 * 16), t0)).toBe(false);
  });
  it('reserves suspension and expulsion for the principal', () => {
    expect(needsPrincipal('suspension')).toBe(true);
    expect(needsPrincipal('warning')).toBe(false);
  });
  it('limits welfare moves and amounts', () => {
    expect(canMoveWelfare('submitted', 'approved')).toBe(true);
    expect(canMoveWelfare('rejected', 'approved')).toBe(false);
    expect(canMoveWelfare('approved', 'disbursed')).toBe(true);
    expect(approvedAmountOk(10_000, 10_001)).toBe(false);
    expect(approvedAmountOk(10_000, 5_000)).toBe(true);
    expect(approvedAmountOk(0, 5_000)).toBe(true);
  });
});
