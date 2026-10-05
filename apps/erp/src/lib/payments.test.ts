import { describe, expect, it } from 'vitest';
import { keyMode, razorpayBody, razorpayProblem, webhookUrl } from './payments';

const empty = { configured: false, keyId: null };
const saved = { configured: true, keyId: 'rzp_live_AAAAaaaa1111' };

describe('Razorpay settings', () => {
  it('tells live from test keys by the prefix', () => {
    expect(keyMode('rzp_live_AAAAaaaa1111')).toBe('live');
    expect(keyMode(' rzp_test_BBBBbbbb2222 ')).toBe('test');
    expect(keyMode('pk_live_123')).toBeNull();
  });

  it('wants both secrets the first time, and the key secret again for a new key id', () => {
    const input = { keyId: 'rzp_live_AAAAaaaa1111', keySecret: 'secret-1234', webhookSecret: 'whsec-5678' };
    expect(razorpayProblem(input, empty)).toBeNull();
    expect(razorpayProblem({ ...input, keyId: 'nope' }, empty)).toBe('keyId');
    expect(razorpayProblem({ ...input, webhookSecret: '' }, empty)).toBe('secretsRequired');
    expect(razorpayProblem({ ...input, keySecret: 'short' }, empty)).toBe('secretShort');
    // Already set up: blank secrets keep the stored ones…
    expect(razorpayProblem({ ...input, keySecret: '', webhookSecret: '' }, saved)).toBeNull();
    // …but a different key id needs its own secret.
    expect(razorpayProblem({ keyId: 'rzp_live_CCCCcccc3333', keySecret: '', webhookSecret: '' }, saved)).toBe('keySecretRequired');
  });

  it('leaves blank secrets out of the body and builds the webhook URL', () => {
    expect(razorpayBody({ keyId: ' rzp_test_BBBBbbbb2222 ', keySecret: ' ', webhookSecret: 'whsec-5678' })).toEqual({ keyId: 'rzp_test_BBBBbbbb2222', webhookSecret: 'whsec-5678' });
    expect(webhookUrl('https://api.kinetix.in/', '/v1/fees/webhooks/razorpay/demo-college')).toBe('https://api.kinetix.in/v1/fees/webhooks/razorpay/demo-college');
  });
});
