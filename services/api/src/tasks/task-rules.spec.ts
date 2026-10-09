import { describe, expect, it } from 'vitest';
import { canMoveTask, dueFor, needsEscalation, needsReminder } from './task-rules.js';

const now = new Date('2026-10-20T04:30:00Z');

describe('task status moves', () => {
  it('allows the normal flow and reopening, nothing else', () => {
    expect(canMoveTask('open', 'in_progress')).toBe(true);
    expect(canMoveTask('in_progress', 'done')).toBe(true);
    expect(canMoveTask('done', 'open')).toBe(true);
    expect(canMoveTask('done', 'cancelled')).toBe(false);
    expect(canMoveTask('open', 'open')).toBe(false);
    expect(canMoveTask('open', 'bogus')).toBe(false);
  });
});

describe('deadlines', () => {
  it('prefers the given date, else adds SLA hours', () => {
    const d = new Date('2026-10-25T00:00:00Z');
    expect(dueFor(d, 4, now)).toBe(d);
    expect(dueFor(null, 4, now)?.toISOString()).toBe('2026-10-20T08:30:00.000Z');
    expect(dueFor(null, null, now)).toBeNull();
  });
  it('escalates active overdue tasks once', () => {
    const late = new Date('2026-10-19T00:00:00Z');
    expect(needsEscalation({ status: 'open', dueAt: late, escalatedAt: null }, now)).toBe(true);
    expect(needsEscalation({ status: 'done', dueAt: late, escalatedAt: null }, now)).toBe(false);
    expect(needsEscalation({ status: 'open', dueAt: late, escalatedAt: now }, now)).toBe(false);
    expect(needsEscalation({ status: 'open', dueAt: new Date('2026-10-21T00:00:00Z'), escalatedAt: null }, now)).toBe(false);
    expect(needsEscalation({ status: 'open', dueAt: null, escalatedAt: null }, now)).toBe(false);
  });
});

describe('needsReminder', () => {
  const created = new Date('2026-10-01T00:00:00Z');
  const t = { status: 'open', createdAt: created, reminderHours: 24, remindedAt: null as Date | null, dueAt: null as Date | null };
  it('fires once after the hours have passed, while the task is not overdue', () => {
    expect(needsReminder(t, new Date('2026-10-01T12:00:00Z'))).toBe(false);
    expect(needsReminder(t, new Date('2026-10-02T01:00:00Z'))).toBe(true);
    expect(needsReminder({ ...t, remindedAt: created }, new Date('2026-10-03T00:00:00Z'))).toBe(false);
    expect(needsReminder({ ...t, dueAt: new Date('2026-10-01T20:00:00Z') }, new Date('2026-10-02T01:00:00Z'))).toBe(false);
  });
});
