import { describe, expect, it } from 'vitest';
import { MESSAGES, type MessageKey } from '@/i18n/messages';
import { groupOf, isLhtPath, LHT_GROUPS, PARAM_ACTIONS, paramBody, sortKeyFor, sourcesFor, toneOf } from './lht';
import { MODULE_REPORTS } from './campus-ops';

describe('library, hostel and transport lists', () => {
  it('puts every list in exactly one group, and names every group and list in the dictionary', () => {
    const all = Object.values(LHT_GROUPS).flatMap((gs) => gs.flatMap((g) => g.entities));
    expect(new Set(all).size).toBe(all.length);
    for (const [module, groups] of Object.entries(LHT_GROUPS)) {
      for (const g of groups) {
        expect(MESSAGES.en[`lht.g.${module}.${g.key}` as MessageKey], g.key).toBeTruthy();
        for (const e of g.entities) {
          expect(MESSAGES.en[`rk.entity.${e}` as MessageKey], e).toBeTruthy();
          expect(MESSAGES.en[`rk.one.${e}` as MessageKey], e).toBeTruthy();
        }
      }
    }
    expect(groupOf('hostel', 'mess-bills')?.key).toBe('mess');
    expect(groupOf('library', 'mess-bills')).toBeNull();
  });

  it('words every action input', () => {
    for (const actions of Object.values(PARAM_ACTIONS)) for (const fields of Object.values(actions)) for (const f of fields) expect(MESSAGES.hi[`lht.p.${f.name}` as MessageKey], f.name).toBeTruthy();
    expect(sourcesFor('library-loans')).toEqual(['branches']);
    expect(sourcesFor('transport-vehicles')).toEqual([]);
  });

  it('turns typed inputs into action parameters', () => {
    const fields = PARAM_ACTIONS['transport-incidents'].fileClaim;
    expect(paramBody(fields, { insurer: 'New India', claimNo: 'CL-1', amount: '25,000' })).toEqual({ params: { insurer: 'New India', claimNo: 'CL-1', amount: 25000 } });
    expect(paramBody(fields, { insurer: 'New India', amount: '1' })).toEqual({ missing: 'claimNo' });
    expect(paramBody(PARAM_ACTIONS['hostel-residents'].vacate, {})).toEqual({ params: { refundUnusedFee: true } });
    expect(paramBody(PARAM_ACTIONS['library-members'].collectDeposit, { amount: 'abc' })).toEqual({ missing: 'amount' });
  });

  it('finds a column’s sort key', () => {
    expect(sortKeyFor('dueOn', ['issued', 'due'])).toBe('due');
    expect(sortKeyFor('accessionNo', ['accession'])).toBe('accession');
    expect(sortKeyFor('fullName', ['name'])).toBe('name');
    expect(sortKeyFor('phone', ['name'])).toBeUndefined();
  });

  it('lets the desks reach only their own API paths', () => {
    expect(isLhtPath('/v1/library/desk/issue')).toBe(true);
    expect(isLhtPath('/v1/transport/handovers/5b0c2a1e-1111-4222-8333-944455556666/verify')).toBe(true);
    expect(isLhtPath('/v1/hostel/mess/bills/charge')).toBe(true);
    expect(isLhtPath('/v1/fees/invoices')).toBe(false);
    expect(isLhtPath('/v1/library/desk/issue?x=1')).toBe(false);
    expect(isLhtPath('/v1/transport/handovers/../../admin/verify')).toBe(false);
  });

  it('colours statuses and lists the new reports with their names', () => {
    expect(toneOf('approved')).toBe('success');
    expect(toneOf('pending')).toBe('warning');
    expect(toneOf('lost')).toBe('danger');
    expect(toneOf('whatever')).toBe('neutral');
    for (const id of [...MODULE_REPORTS.library, ...MODULE_REPORTS.hostel, ...MODULE_REPORTS.transport]) expect(MESSAGES.kn[`cops.r.${id}` as MessageKey], id).toBeTruthy();
  });
});
