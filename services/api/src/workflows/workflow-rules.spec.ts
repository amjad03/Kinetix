import { describe, expect, it } from 'vitest';
import { applicableSteps, validatePayload, type FormField, type StepDef } from './workflow-rules.js';

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
