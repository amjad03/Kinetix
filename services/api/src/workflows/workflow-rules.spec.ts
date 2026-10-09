import { describe, expect, it } from 'vitest';
import { applicableSteps, conditionHolds, parallelOutcome, slaAction, validatePayload, type FormField, type StepDef } from './workflow-rules.js';

const step = (name: string, extra: Partial<StepDef> = {}): StepDef => ({ name, approver: { kind: 'department_head' }, ...extra });

describe('applicableSteps', () => {
  const steps = [step('HOD'), step('Principal', { minAmount: 10000 }), step('Small only', { maxAmount: 999 })];
  it('skips steps whose amount condition is not met', () => {
    expect(applicableSteps(steps, 500).map((s) => s.name)).toEqual(['HOD', 'Small only']);
    expect(applicableSteps(steps, 10000).map((s) => s.name)).toEqual(['HOD', 'Principal']);
  });
  it('treats a missing amount as zero', () => {
    expect(applicableSteps(steps, null).map((s) => s.name)).toEqual(['HOD', 'Small only']);
  });
});

describe('validatePayload', () => {
  const fields: FormField[] = [
    { key: 'reason', label: 'Reason', type: 'text', required: true },
    { key: 'days', label: 'Days', type: 'number', required: false },
    { key: 'from', label: 'From', type: 'date', required: true },
    { key: 'kind', label: 'Kind', type: 'select', required: true, options: ['casual', 'sick'] },
  ];
  it('accepts a good payload, converts numbers and drops unknown keys', () => {
    const r = validatePayload(fields, { reason: ' Fever ', days: '2', from: '2026-10-12', kind: 'sick', extra: 1 });
    expect(r.errors).toEqual([]);
    expect(r.clean).toEqual({ reason: 'Fever', days: 2, from: '2026-10-12', kind: 'sick' });
  });
  it('reports every problem', () => {
    const r = validatePayload(fields, { days: 'x', from: '2026-02-30', kind: 'other' });
    expect(r.errors).toHaveLength(4);
  });
});

describe('conditional and parallel steps', () => {
  it('applies a step only when its field comparisons hold', () => {
    const steps = [step('HOD'), step('Finance', { conditions: [{ field: 'amount', op: '>', value: 50000 }] }), step('Dean', { conditions: [{ field: 'kind', op: 'in', value: ['capex', 'grant'] }] })];
    expect(applicableSteps(steps, 1000, { kind: 'travel' }).map((s) => s.name)).toEqual(['HOD']);
    expect(applicableSteps(steps, 60000, { kind: 'capex' }).map((s) => s.name)).toEqual(['HOD', 'Finance', 'Dean']);
  });
  it('compares numbers numerically and never matches a missing field', () => {
    expect(conditionHolds({ field: 'days', op: '>=', value: 10 }, null, { days: '9' })).toBe(false);
    expect(conditionHolds({ field: 'days', op: '>=', value: 10 }, null, { days: '12' })).toBe(true);
    expect(conditionHolds({ field: 'days', op: '!=', value: 10 }, null, {})).toBe(false);
  });
  it('needs every approver for all, the first for any, and an escalation target alone', () => {
    expect(parallelOutcome('all', [{ decided: true, escalation: false }, { decided: false, escalation: false }])).toBe('waiting');
    expect(parallelOutcome('all', [{ decided: true, escalation: false }, { decided: true, escalation: false }])).toBe('done');
    expect(parallelOutcome('any', [{ decided: true, escalation: false }, { decided: false, escalation: false }])).toBe('done');
    expect(parallelOutcome('all', [{ decided: false, escalation: false }, { decided: true, escalation: true }])).toBe('done');
  });
  it('reminds before the SLA and escalates once it runs out', () => {
    const t0 = new Date('2026-10-01T00:00:00Z');
    const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);
    const s = { slaHours: 48, reminderHours: 24 };
    expect(slaAction(s, t0, at(10), { reminded: false, escalated: false })).toBeNull();
    expect(slaAction(s, t0, at(25), { reminded: false, escalated: false })).toBe('remind');
    expect(slaAction(s, t0, at(25), { reminded: true, escalated: false })).toBeNull();
    expect(slaAction(s, t0, at(49), { reminded: true, escalated: false })).toBe('escalate');
    expect(slaAction(s, t0, at(99), { reminded: true, escalated: true })).toBeNull();
  });
});
