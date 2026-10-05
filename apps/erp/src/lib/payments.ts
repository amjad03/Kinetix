// The institution's own Razorpay account (GET/PUT /v1/admin/payments/razorpay, POST …/test).
// Fees paid online go straight to it; secrets are write-only and never come back.

export interface RazorpayAccount {
  /** The server's payment mode: razorpay, demo (no money moves) or none (counter only). */
  provider: 'razorpay' | 'demo' | 'none';
  configured: boolean;
  keyId: string | null;
  mode: 'test' | 'live' | null;
  keySecretLast4: string | null;
  updatedAt: string | null;
  webhookPath: string;
}

export type RazorpayTestResult = { ok: true; keyId: string; mode: 'test' | 'live' } | { ok: false; error: string; status?: number };

export interface RazorpayInput {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export type RazorpayProblem = 'keyId' | 'secretsRequired' | 'keySecretRequired' | 'secretShort';

const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/;

/** Live or test, from the key id's prefix (as the API infers it). */
export const keyMode = (keyId: string): 'test' | 'live' | null => (KEY_ID.test(keyId.trim()) ? (keyId.trim().startsWith('rzp_live_') ? 'live' : 'test') : null);

/** Checks the form the way the API does: both secrets the first time, the key secret again for a new key id. */
export function razorpayProblem(input: RazorpayInput, saved: Pick<RazorpayAccount, 'configured' | 'keyId'>): RazorpayProblem | null {
  const keyId = input.keyId.trim();
  if (!KEY_ID.test(keyId)) return 'keyId';
  const keySecret = input.keySecret.trim();
  const webhookSecret = input.webhookSecret.trim();
  if ((keySecret && keySecret.length < 8) || (webhookSecret && webhookSecret.length < 8)) return 'secretShort';
  if (!saved.configured && !(keySecret && webhookSecret)) return 'secretsRequired';
  if (saved.configured && saved.keyId !== keyId && !keySecret) return 'keySecretRequired';
  return null;
}

/** The PUT body: empty secrets are left out, so the stored ones are kept. */
export function razorpayBody(input: RazorpayInput): { keyId: string; keySecret?: string; webhookSecret?: string } {
  const keySecret = input.keySecret.trim();
  const webhookSecret = input.webhookSecret.trim();
  return { keyId: input.keyId.trim(), ...(keySecret ? { keySecret } : {}), ...(webhookSecret ? { webhookSecret } : {}) };
}

/** The URL to paste into the Razorpay dashboard: the API's public address and this institution's path. */
export function webhookUrl(apiUrl: string, path: string): string {
  return `${apiUrl.replace(/\/+$/, '')}${path}`;
}
