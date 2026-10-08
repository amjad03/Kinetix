import { describe, expect, it } from 'vitest';
import { proofPath, sponsorInvoiceBody } from './payments-desk';

const S1 = '3f2b8c1e-9d4a-4c55-8e0a-1b2c3d4e5f60';
const S2 = '7a1d2c3e-4b5f-4a6b-9c7d-8e9f0a1b2c3d';
const base = { sponsorId: S1, title: ' Semester 3 tuition ', dueOn: '2026-11-15' };

describe('sponsor invoice form', () => {
  it('builds one line per chosen student, with the title as the default description', () => {
    const r = sponsorInvoiceBody({ ...base, poNumber: ' PO-7 ', s1: S1, a1: '2000000', s2: S2, a2: '1500000', s3: '', a3: '' });
    expect(r).toEqual({
      ok: true,
      body: {
        sponsorId: S1,
        poNumber: 'PO-7',
        title: 'Semester 3 tuition',
        dueOn: '2026-11-15',
        lines: [
          { studentId: S1, description: 'Semester 3 tuition', amountPaise: 2000000 },
          { studentId: S2, description: 'Semester 3 tuition', amountPaise: 1500000 },
        ],
      },
    });
  });

  it('leaves out an empty PO number and a repeated student', () => {
    const r = sponsorInvoiceBody({ ...base, description: 'Tuition', s1: S1, a1: '10000', s2: S1, a2: '20000' });
    expect(r.ok && r.body).toMatchObject({ lines: [{ studentId: S1, description: 'Tuition', amountPaise: 10000 }] });
    expect(r.ok && 'poNumber' in r.body).toBe(false);
  });

  it('refuses a form with no student, or a student without a fee', () => {
    expect(sponsorInvoiceBody({ ...base })).toEqual({ ok: false, reason: 'lines' });
    expect(sponsorInvoiceBody({ ...base, s1: S1, a1: '' })).toEqual({ ok: false, reason: 'amount' });
    expect(sponsorInvoiceBody({ ...base, s1: '', a1: '5000' })).toEqual({ ok: false, reason: 'amount' });
    expect(sponsorInvoiceBody({ ...base, s1: S1, a1: '50' })).toEqual({ ok: false, reason: 'amount' });
  });
});

describe('bank transfer proof link', () => {
  it('goes through the ERP download route', () => {
    expect(decodeURIComponent(proofPath(S1))).toBe(`/api/export?path=/v1/fees/bank-transfers/${S1}/proof`);
  });
});
