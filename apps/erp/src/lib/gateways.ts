// Payment gateways per institution and per fee account (GET/PUT/DELETE /v1/admin/payments/gateways, POST …/:scope/test).
// Secrets are write-only: the API never sends them back.

export const GATEWAYS = ['razorpay', 'payu', 'cashfree', 'easebuzz', 'ccavenue'] as const;
export type Gateway = (typeof GATEWAYS)[number];

export interface GatewayAccount {
  id: string;
  feeAccountId: string | null;
  feeAccount: string | null;
  provider: Gateway;
  mode: 'test' | 'live';
  keyId: string;
  accessCode: string | null;
  keySecretLast4: string;
  active: boolean;
  updatedAt: string;
  webhookPath: string;
}

export interface GatewayInput {
  provider: Gateway;
  feeAccountId: string | null;
  mode?: 'test' | 'live';
  keyId: string;
  keySecret?: string;
  webhookSecret?: string;
  accessCode?: string | null;
}

export type GatewayTest = { ok: true; provider: string; keyId: string; mode: string } | { ok: false; error: string };

/** What each gateway calls its fields, and which it needs. */
export const GATEWAY_FIELDS: Record<Gateway, { keyId: string; secret: string; webhook?: boolean; access?: 'code' | 'email'; idPattern: RegExp; mode: boolean }> = {
  razorpay: { keyId: 'ff.gw.razorpayKey', secret: 'ff.gw.keySecret', webhook: true, idPattern: /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, mode: false },
  payu: { keyId: 'ff.gw.merchantKey', secret: 'ff.gw.salt', idPattern: /^[A-Za-z0-9]{4,40}$/, mode: true },
  cashfree: { keyId: 'ff.gw.appId', secret: 'ff.gw.secretKey', idPattern: /^[A-Za-z0-9_-]{6,80}$/, mode: true },
  easebuzz: { keyId: 'ff.gw.merchantKey', secret: 'ff.gw.salt', access: 'email', idPattern: /^[A-Za-z0-9]{4,40}$/, mode: true },
  ccavenue: { keyId: 'ff.gw.merchantId', secret: 'ff.gw.workingKey', access: 'code', idPattern: /^\d{3,15}$/, mode: true },
};

export type GatewayProblem = 'keyId' | 'secretRequired' | 'secretShort' | 'webhookRequired' | 'accessRequired';

/** Checks the form as the API will: the secret the first time (and for a new key), CCAvenue's access code, Razorpay's webhook secret. */
export function gatewayProblem(input: GatewayInput, saved: GatewayAccount | undefined): GatewayProblem | null {
  const f = GATEWAY_FIELDS[input.provider];
  if (!f.idPattern.test(input.keyId.trim())) return 'keyId';
  const secret = (input.keySecret ?? '').trim();
  if (secret && secret.length < 8) return 'secretShort';
  const same = saved && saved.provider === input.provider && saved.keyId === input.keyId.trim();
  if (!secret && !same) return 'secretRequired';
  if (input.provider === 'razorpay' && !saved && !(input.webhookSecret ?? '').trim()) return 'webhookRequired';
  if (f.access === 'code' && !(input.accessCode ?? '').trim()) return 'accessRequired';
  return null;
}

/** The PUT body: empty secrets are left out so the stored ones stay. */
export function gatewayBody(input: GatewayInput): GatewayInput {
  const f = GATEWAY_FIELDS[input.provider];
  const keySecret = (input.keySecret ?? '').trim();
  const webhookSecret = (input.webhookSecret ?? '').trim();
  const accessCode = (input.accessCode ?? '').trim();
  return {
    provider: input.provider,
    feeAccountId: input.feeAccountId,
    keyId: input.keyId.trim(),
    ...(f.mode ? { mode: input.mode ?? 'test' } : {}),
    ...(keySecret ? { keySecret } : {}),
    ...(f.webhook && webhookSecret ? { webhookSecret } : {}),
    ...(f.access ? { accessCode: accessCode || null } : {}),
  };
}
