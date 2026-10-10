import { describe, expect, it } from 'vitest';
import { fillPath, formBody, isDepthPath, type Field } from './depth';
import { opt, STATE_TONES, stateWords } from './depth-ui';

const ID = '6f1d2c3e-4b5a-4c6d-8e7f-1a2b3c4d5e6f';

describe('formBody', () => {
  const fields: Field[] = [
    { name: 'title', label: 'Title', type: 'text' },
    { name: 'hours', label: 'Hours', type: 'number' },
    { name: 'amountPaise', label: 'Amount', type: 'paise' },
    { name: 'active', label: 'Active', type: 'bool' },
    { name: 'releaseAt', label: 'Release', type: 'datetime' },
    { name: 'capPaise', label: 'Cap', type: 'paise', nullable: true },
    { name: 'scores.clarity', label: 'Clarity', type: 'number' },
    { name: 'scores.support', label: 'Support', type: 'number' },
  ];

  it('turns text into the types the API expects', () => {
    const out = formBody(fields, { title: ' Overtime ', hours: '12.5', amountPaise: '5,769', active: 'true', releaseAt: '2026-11-02T09:30', capPaise: '', 'scores.clarity': '4', 'scores.support': '5' });
    expect('body' in out && out.body).toEqual({ title: 'Overtime', hours: 12.5, amountPaise: 576_900, active: true, releaseAt: new Date('2026-11-02T09:30').toISOString(), capPaise: null, scores: { clarity: 4, support: 5 } });
  });

  it('leaves blank optional fields out, and a blank yes/no as no', () => {
    const out = formBody(fields, { title: '', hours: '', active: '' });
    expect('body' in out && out.body).toEqual({ active: false, capPaise: null });
  });

  it('names the field that cannot be read', () => {
    expect(formBody(fields, { hours: 'twelve' })).toEqual({ error: 'hours' });
    expect(formBody(fields, { amountPaise: '-5' })).toEqual({ error: 'amountPaise' });
    expect(formBody(fields, { releaseAt: 'tomorrow' })).toEqual({ error: 'releaseAt' });
  });

  it('reads a list typed one entry a line', () => {
    const bands: Field[] = [{ name: 'bands', label: 'Bands', type: 'lines', lines: { keys: ['name', 'minPercent'], numeric: ['minPercent'] } }];
    expect(formBody(bands, { bands: 'Distinction, 75\n First class,60\n\n' })).toEqual({ body: { bands: [{ name: 'Distinction', minPercent: 75 }, { name: 'First class', minPercent: 60 }] } });
    expect(formBody(bands, { bands: 'Distinction' })).toEqual({ error: 'bands' });
    expect(formBody(bands, { bands: 'Distinction, lots' })).toEqual({ error: 'bands' });
  });

  it('keeps fixed values, and drops the fields that belong in the path', () => {
    const out = formBody([{ name: 'paperId', label: 'Paper', type: 'select' }, { name: 'releaseAt', label: 'Release', type: 'datetime' }], { paperId: ID, releaseAt: '2026-11-02T09:30' }, { preview: true }, ['paperId']);
    expect('body' in out && Object.keys(out.body).sort()).toEqual(['preview', 'releaseAt']);
  });
});

describe('fillPath', () => {
  it('fills placeholders from the row and escapes them', () => {
    expect(fillPath('/v1/library/loans/{id}/renew', { id: ID })).toBe(`/v1/library/loans/${ID}/renew`);
    expect(fillPath('/v1/retention/sensitive/rules/{id}', { id: 'health visits/../x' })).toBe('/v1/retention/sensitive/rules/health%20visits%2F..%2Fx');
    expect(fillPath('/v1/x/{missing}', {})).toBe('/v1/x/');
  });
});

describe('the paths a desk may call', () => {
  it('allows the depth routes', () => {
    for (const p of [
      `/v1/question-bank/papers/${ID}/release`,
      `/v1/question-bank/papers/${ID}/release/cancel`,
      `/v1/exam-sessions/${ID}/practicals`,
      `/v1/exam-sessions/${ID}/request-publish`,
      `/v1/practicals/${ID}/marks`,
      `/v1/exam-ops/normalise/${ID}`,
      '/v1/exam-ops/class-bands',
      `/v1/quality/criteria/${ID}`,
      `/v1/quality/criteria/${ID}/evidence`,
      `/v1/quality/frameworks/${ID}/harvest`,
      `/v1/hr/payroll/adjustments/${ID}/decide`,
      '/v1/hr/payroll/adjustments/revision-arrears',
      `/v1/fees/invoices/${ID}/apply-credit`,
      '/v1/fees/credits/refund',
      `/v1/asset-ops/smartboards/${ID}/link`,
      `/v1/library/loans/${ID}/damaged`,
      `/v1/library/topic-links/${ID}`,
      `/v1/hostel/work-orders/${ID}/verify`,
      '/v1/canteen/ops/stock',
      '/v1/retention/sensitive/rules/health_visits',
      `/v1/mentoring/plans/${ID}/support`,
    ])
      expect(isDepthPath(p), p).toBe(true);
  });

  it('refuses everything else', () => {
    for (const p of ['/v1/auth/login', '/v1/admin/structure', '/v1/fees/invoices', `/v1/fees/invoices/${ID}/cancel`, `/v1/library/loans/${ID}/return`, `/v1/hr/payroll/adjustments/${ID}/decide?x=1`, '/v1/retention/sensitive/rules/../../auth', `/v1/exam-ops/normalise/not-an-id`, 'https://example.org/v1/exam-ops/class-bands'])
      expect(isDepthPath(p), p).toBe(false);
  });
});

describe('page helpers', () => {
  it('builds select options and the status words', () => {
    expect(opt([{ id: 'a', n: 'One' }], (x) => x.id, (x) => x.n)).toEqual([{ value: 'a', label: 'One' }]);
    expect(stateWords((k) => `[${k}]`)).toMatchObject({ sealed: '[dx.state.sealed]', not_effective: '[dx.state.not_effective]' });
    expect(Object.keys(stateWords((k) => k))).toEqual(Object.keys(STATE_TONES));
  });
});
