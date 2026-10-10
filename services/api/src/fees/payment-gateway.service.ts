import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { SecretBox } from '../common/secret-box.js';
import type { Tx } from '../db/db.service.js';
import { paymentGatewayAccounts } from '../db/schema.js';
import { DemoPaymentProvider, PayuApi, PayuProvider, type PaymentProvider, RazorpayApi, RazorpayProvider } from './payment-provider.js';

/** The message (and so the code PAYMENTS_NOT_CONFIGURED) when an institution cannot take online payments. */
export const PAYMENTS_NOT_CONFIGURED = 'Online payment is not available yet. Please pay at the fees counter.';
export const SECRETS_KEY_MISSING = 'Payment keys cannot be stored on this server yet (SECRETS_ENCRYPTION_KEY is not set)';

/** What the ERP may see of an institution's Razorpay account: never a secret. */
export interface RazorpayAccountView {
  /** The server's payment mode: gateways (live), demo (no money moves) or none. */
  provider: Env['PAYMENTS_PROVIDER'];
  /** The gateway this institution chose: razorpay or payu (null until it saves one). */
  gateway: 'razorpay' | 'payu' | null;
  configured: boolean;
  keyId: string | null;
  /** Inferred from the key id: rzp_live_… is live, anything else test. */
  mode: 'test' | 'live' | null;
  keySecretLast4: string | null;
  updatedAt: Date | null;
  /** Append to the API's public address for the Razorpay dashboard's webhook URL. */
  webhookPath: string;
  /** The same for PayU's dashboard. */
  payuWebhookPath: string;
}

export const keyMode = (keyId: string): 'test' | 'live' => (keyId.startsWith('rzp_live_') ? 'live' : 'test');
const aad = (tenantId: string, field: 'key_secret' | 'webhook_secret') => `${tenantId}:razorpay.${field}`;

/**
 * Each institution receives fees in its own Razorpay account. This finds the gateway for the
 * institution of the current transaction (row-level security scopes the lookup), decrypting
 * its secrets with the master key. In demo mode every institution gets the demo gateway.
 */
@Injectable()
export class PaymentGateway {
  readonly mode: Env['PAYMENTS_PROVIDER'];
  private readonly box: SecretBox | undefined;
  private readonly payuMode: 'test' | 'live';

  constructor(
    @Inject(ENV) env: Env,
    private readonly api: RazorpayApi,
    private readonly payu: PayuApi,
  ) {
    this.mode = env.PAYMENTS_PROVIDER;
    this.payuMode = env.PAYU_MODE;
    this.box = SecretBox.fromEnv(env);
  }

  /** The institution's gateway, or null when it cannot take online payments. */
  async forTenant(tx: Tx): Promise<PaymentProvider | null> {
    if (this.mode === 'demo') return new DemoPaymentProvider();
    if (this.mode === 'none' || !this.box) return null;
    const keys = await this.keys(tx);
    if (!keys) return null;
    return keys.provider === 'payu' ? new PayuProvider(keys.keyId, keys.keySecret, this.payu, this.payuMode) : new RazorpayProvider(keys.keyId, keys.keySecret, keys.webhookSecret, this.api);
  }

  /** 'razorpay', 'payu', 'demo' or null, without decrypting anything. */
  async availableName(tx: Tx): Promise<string | null> {
    if (this.mode === 'demo') return 'demo';
    if (this.mode === 'none') return null;
    const [row] = await tx.select({ provider: paymentGatewayAccounts.provider }).from(paymentGatewayAccounts);
    return row ? row.provider : null;
  }

  async view(tx: Tx, tenantSlug: string): Promise<RazorpayAccountView> {
    const [row] = await tx.select().from(paymentGatewayAccounts);
    return {
      provider: this.mode,
      gateway: row ? (row.provider === 'payu' ? 'payu' : 'razorpay') : null,
      configured: !!row,
      keyId: row?.keyId ?? null,
      mode: row ? (row.provider === 'payu' ? this.payuMode : keyMode(row.keyId)) : null,
      keySecretLast4: row?.keySecretLast4 ?? null,
      updatedAt: row?.updatedAt ?? null,
      webhookPath: `/v1/fees/webhooks/razorpay/${tenantSlug}`,
      payuWebhookPath: `/v1/fees/webhooks/payu/${tenantSlug}`,
    };
  }

  /** The decrypted keys of the current institution's account, or null. */
  async keys(tx: Tx): Promise<{ tenantId: string; provider: string; keyId: string; keySecret: string; webhookSecret: string } | null> {
    const [row] = await tx.select().from(paymentGatewayAccounts);
    if (!row) return null;
    const box = this.requireBox();
    return { tenantId: row.tenantId, provider: row.provider, keyId: row.keyId, keySecret: box.decrypt(row.keySecretEnc, aad(row.tenantId, 'key_secret')), webhookSecret: box.decrypt(row.webhookSecretEnc, aad(row.tenantId, 'webhook_secret')) };
  }

  /** Saves the account. A secret left out keeps the stored one. Returns what changed. */
  async save(tx: Tx, tenantId: string, userId: string, input: { provider?: 'razorpay' | 'payu'; keyId: string; keySecret?: string; webhookSecret?: string }) {
    const box = this.requireBox();
    const [row] = await tx.select().from(paymentGatewayAccounts);
    const values = {
      provider: input.provider ?? 'razorpay',
      keyId: input.keyId,
      ...(input.keySecret ? { keySecretEnc: box.encrypt(input.keySecret, aad(tenantId, 'key_secret')), keySecretLast4: input.keySecret.slice(-4) } : {}),
      ...(input.webhookSecret ? { webhookSecretEnc: box.encrypt(input.webhookSecret, aad(tenantId, 'webhook_secret')) } : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (row) await tx.update(paymentGatewayAccounts).set(values).where(eq(paymentGatewayAccounts.tenantId, tenantId));
    else await tx.insert(paymentGatewayAccounts).values({ tenantId, keySecretEnc: '', keySecretLast4: '', webhookSecretEnc: '', ...values });
    return { created: !row, keyIdChanged: row?.keyId !== input.keyId, keySecretChanged: !!input.keySecret, providerChanged: !!row && row.provider !== (input.provider ?? 'razorpay'), webhookSecretChanged: !!input.webhookSecret };
  }

  async remove(tx: Tx, tenantId: string): Promise<boolean> {
    const deleted = await tx.delete(paymentGatewayAccounts).where(eq(paymentGatewayAccounts.tenantId, tenantId)).returning({ tenantId: paymentGatewayAccounts.tenantId });
    return deleted.length > 0;
  }

  ping(keys: { provider?: string; keyId: string; keySecret: string }) {
    return keys.provider === 'payu' ? this.payu.ping({ key: keys.keyId, salt: keys.keySecret }) : this.api.ping(keys);
  }

  private requireBox(): SecretBox {
    if (!this.box) throw new ServiceUnavailableException(SECRETS_KEY_MISSING);
    return this.box;
  }
}
