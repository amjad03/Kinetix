import { describe, expect, it } from 'vitest';
import { formatFields, formatSteps, parseAmount, parseFields, parseSteps } from './workflows';

describe('workflow definition editor formats', () => {
  it('reads field lines and writes them back', () => {
    const text = 'days | Days | number | required\nkind | Kind | select | required | casual, sick\nnote | Note | text';
    const r = parseFields(text);
    expect(r.ok && r.value).toEqual([
      { key: 'days', label: 'Days', type: 'number', required: true },
      { key: 'kind', label: 'Kind', type: 'select', required: true, options: ['casual', 'sick'] },
      { key: 'note', label: 'Note', type: 'text', required: false },
    ]);
    expect(r.ok && formatFields(r.value)).toBe(text);
  });

  it('points at the line that is wrong', () => {
    expect(parseFields('a | A | text\nb | B | colour')).toEqual({ ok: false, line: 2 });
    expect(parseFields('a | A | select')).toEqual({ ok: false, line: 1 });
  });

  it('reads step lines with approver, thresholds and SLA', () => {
    const text = 'Head | head | | | 24\nAccounts | role:accountant | 5000\nDesk | user:abc | 1 | 9';
    const r = parseSteps(text);
    expect(r.ok && r.value.map((s) => s.approver)).toEqual([{ kind: 'department_head' }, { kind: 'role', role: 'accountant' }, { kind: 'user', userId: 'abc' }]);
    expect(r.ok && r.value[0].slaHours).toBe(24);
    expect(r.ok && r.value[1].minAmount).toBe(5000);
    expect(r.ok && formatSteps(r.value)).toBe('Head | head | | | 24\nAccounts | role:accountant | 5000\nDesk | user:abc | 1 | 9');
    expect(parseSteps('Nobody | someone')).toEqual({ ok: false, line: 1 });
    expect(parseSteps('X | head | x')).toEqual({ ok: false, line: 1 });
  });

  it('reads parallel approvers, conditions, escalation and reminder, and writes them back', () => {
    const text = 'Budget | all(role:accountant, role:hr_manager) | | | 48 | amount>100000; kind in capex/grant | role:principal | 24\nSign | any(head, user:abc) | 1000';
    const r = parseSteps(text);
    expect(r.ok && r.value[0]).toEqual({
      name: 'Budget',
      approvers: [{ kind: 'role', role: 'accountant' }, { kind: 'role', role: 'hr_manager' }],
      mode: 'all',
      minAmount: null,
      maxAmount: null,
      slaHours: 48,
      conditions: [{ field: 'amount', op: '>', value: 100000 }, { field: 'kind', op: 'in', value: ['capex', 'grant'] }],
      escalateTo: { kind: 'role', role: 'principal' },
      reminderHours: 24,
    });
    expect(r.ok && r.value[1].mode).toBe('any');
    expect(r.ok && formatSteps(r.value)).toBe(text);
  });

  it('refuses malformed parallel steps, conditions and escalation', () => {
    expect(parseSteps('S | all(role:a) ')).toEqual({ ok: false, line: 1 }); // one approver is not parallel
    expect(parseSteps('S | all(role:a, nobody)')).toEqual({ ok: false, line: 1 });
    expect(parseSteps('S | head | | | | amount ~ 5')).toEqual({ ok: false, line: 1 });
    expect(parseSteps('S | head | | | | | role:principal')).toEqual({ ok: false, line: 1 }); // escalation needs an SLA
    expect(parseSteps('S | head | | | 10 | | role:principal | 10')).toEqual({ ok: false, line: 1 }); // reminder not before the SLA
    expect(parseSteps('S | head | | | 10 | | head')).toEqual({ ok: false, line: 1 });
  });

  it('parses amounts', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1250.50')).toBe(1250.5);
    expect(parseAmount('12a')).toBeUndefined();
  });
});
