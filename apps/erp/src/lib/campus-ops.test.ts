import { describe, expect, it } from 'vitest';
import { actionsFor, factsOf, formatField, humanize, isRecordKind, statusOf, toneOf, workflowSteps } from './campus-ops';

describe('campus-ops record helpers', () => {
  it('reads a status from status, stage or a loan return', () => {
    expect(statusOf('requisition', { status: 'submitted' })).toBe('submitted');
    expect(statusOf('enquiry', { stage: 'new' })).toBe('new');
    expect(statusOf('loan', { returned_at: null })).toBe('open');
    expect(statusOf('loan', { returned_at: '2026-10-01T00:00:00Z' })).toBe('returned');
    expect(toneOf('approved')).toBe('success');
    expect(toneOf('rejected')).toBe('danger');
    expect(toneOf('submitted')).toBe('warning');
  });

  it('builds workflow steps on and off the happy path', () => {
    expect(workflowSteps('requisition', 'approved').map((s) => s.state)).toEqual(['done', 'current', 'upcoming']);
    expect(workflowSteps('requisition', 'ordered').map((s) => s.state)).toEqual(['done', 'done', 'done']);
    expect(workflowSteps('requisition', 'rejected')).toEqual([{ id: 'submitted', state: 'done' }, { id: 'rejected', state: 'rejected' }]);
    expect(workflowSteps('gate-pass', 'issued').map((s) => s.id)).toEqual(['issued', 'out', 'returned']);
    expect(workflowSteps('invoice', 'matched').map((s) => s.id)).toEqual(['matched', 'paid']);
    expect(workflowSteps('book', 'x')).toEqual([]);
  });

  it('offers only the actions allowed in the current status', () => {
    expect(actionsFor('requisition', 'submitted').map((a) => a.key)).toEqual(['approve', 'reject']);
    expect(actionsFor('requisition', 'approved')).toEqual([]);
    expect(actionsFor('gate-pass', 'out').map((a) => a.key)).toEqual(['markIn']);
  });

  it('picks facts and formats values', () => {
    const facts = factsOf({ id: 'x', tenant_id: 'y', vendor_id: 'z', number: 'PO-1', status: 'issued', total_paise: 125000, notes: { a: 1 } });
    expect(facts.map(([k]) => k)).toEqual(['number', 'status', 'total_paise']);
    expect(formatField('total_paise', 125000)).toBe('₹1,250');
    expect(formatField('active', true)).toBe('Yes');
    expect(formatField('issued_at', '2026-10-12T05:30:00.000Z')).toBe('2026-10-12 05:30');
    expect(humanize('expected_back_at')).toBe('Expected back');
    expect(isRecordKind('purchase-order')).toBe(true);
    expect(isRecordKind('users')).toBe(false);
  });
});
