import { describe, expect, it } from 'vitest';
import { MESSAGES, type MessageKey } from '@/i18n/messages';
import { GATEWAY_FIELDS, GATEWAYS, gatewayBody, gatewayProblem, type GatewayAccount } from './gateways';
import { REPORTS, REPORT_STATUSES } from './fee-desk';

const saved = (o: Partial<GatewayAccount> = {}): GatewayAccount => ({ id: 'g1', feeAccountId: null, feeAccount: null, provider: 'cashfree', mode: 'test', keyId: 'TEST1023456789', accessCode: null, keySecretLast4: '0001', active: true, updatedAt: '2026-10-20T00:00:00Z', webhookPath: '/v1/fees/webhooks/cashfree/x', ...o });

describe('gateway form', () => {
  it('asks for each gateway’s own fields, and the secret only the first time or for a new key', () => {
    expect(gatewayProblem({ provider: 'razorpay', feeAccountId: null, keyId: 'key', keySecret: 'x'.repeat(10) }, undefined)).toBe('keyId');
    expect(gatewayProblem({ provider: 'razorpay', feeAccountId: null, keyId: 'rzp_test_Abc123456', keySecret: 'x'.repeat(10) }, undefined)).toBe('webhookRequired');
    expect(gatewayProblem({ provider: 'razorpay', feeAccountId: null, keyId: 'rzp_test_Abc123456', keySecret: 'x'.repeat(10), webhookSecret: 'y'.repeat(10) }, undefined)).toBeNull();
    expect(gatewayProblem({ provider: 'cashfree', feeAccountId: null, keyId: 'TEST1023456789' }, undefined)).toBe('secretRequired');
    expect(gatewayProblem({ provider: 'cashfree', feeAccountId: null, keyId: 'TEST1023456789' }, saved())).toBeNull();
    expect(gatewayProblem({ provider: 'cashfree', feeAccountId: null, keyId: 'TEST9999999999' }, saved())).toBe('secretRequired');
    expect(gatewayProblem({ provider: 'cashfree', feeAccountId: null, keyId: 'TEST1023456789', keySecret: 'short' }, saved())).toBe('secretShort');
    expect(gatewayProblem({ provider: 'ccavenue', feeAccountId: null, keyId: '2034567', keySecret: 'A'.repeat(32) }, undefined)).toBe('accessRequired');
    expect(gatewayProblem({ provider: 'ccavenue', feeAccountId: null, keyId: 'M2034567', keySecret: 'A'.repeat(32), accessCode: 'AVJK12AB34CD56EF' }, undefined)).toBe('keyId');
  });

  it('sends only what the gateway takes, and leaves empty secrets out so the saved ones stay', () => {
    expect(gatewayBody({ provider: 'razorpay', feeAccountId: null, mode: 'live', keyId: ' rzp_live_Abc123456 ', keySecret: '', webhookSecret: 'w'.repeat(10), accessCode: 'x' })).toEqual({ provider: 'razorpay', feeAccountId: null, keyId: 'rzp_live_Abc123456', webhookSecret: 'w'.repeat(10) });
    expect(gatewayBody({ provider: 'easebuzz', feeAccountId: 'a1', mode: 'test', keyId: 'EBZKEY1234', keySecret: 's'.repeat(12), accessCode: '' })).toEqual({ provider: 'easebuzz', feeAccountId: 'a1', mode: 'test', keyId: 'EBZKEY1234', keySecret: 's'.repeat(12), accessCode: null });
  });

  it('has words for every gateway, field and problem in every language', () => {
    const keys = new Set<string>();
    for (const g of GATEWAYS) {
      keys.add(`fd.st.${g}`).add(`ff.gw.help.${g}`).add(GATEWAY_FIELDS[g].keyId).add(GATEWAY_FIELDS[g].secret);
    }
    for (const p of ['keyId', 'secretRequired', 'secretShort', 'webhookRequired', 'accessRequired']) keys.add(`ff.gw.problem.${p}`);
    for (const k of keys) for (const l of ['en', 'hi', 'kn'] as const) expect(MESSAGES[l][k as MessageKey], `${l} ${k}`).toBeTruthy();
  });
});

describe('fees reports', () => {
  it('names every report, its columns, totals and status filter values in every language', () => {
    for (const r of REPORTS) {
      const keys = [`fd.rep.${r.key}`, `fd.rep.${r.key}.sub`, ...r.columns.map((c) => c.label), ...r.totals.map(([, l]) => l)];
      for (const k of keys) expect(MESSAGES.en[k as MessageKey], k).toBeTruthy();
      for (const s of REPORT_STATUSES[r.key] ?? []) expect(MESSAGES.kn[`fd.st.${s}` as MessageKey], `fd.st.${s}`).toBeTruthy();
    }
  });
});
