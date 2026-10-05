import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { SecretBox } from '../common/secret-box.js';
import type { Tx } from '../db/db.service.js';
import { paymentGatewayAccounts } from '../db/schema.js';
import { DemoPaymentProvider, type PaymentProvider, RazorpayApi, RazorpayProvider } from './payment-provider.js';

/** The message (and so the code PAYMENTS_NOT_CONFIGURED) when an institution cannot take online payments. */
export const PAYMENTS_NOT_CONFIGURED = 'Online payment is not available yet. Please pay at the fees counter.';
export const SECRETS_KEY_MISSING = 'Payment keys cannot be stored on this server yet (SECRETS_ENCRYPTION_KEY is not set)';

/** What the ERP may see of an institution's Razorpay account: never a secret. */
export interface RazorpayAccountView {
  /** The server's payment mode: razorpay, demo (no money moves) or none. */
  provider: Env['PAYMENTS_PROVIDER'];
  configured: boolean;
  keyId: string | null;
  /** Inferred from the key id: rzp_live_… is live, anything else test. */
  mode: 'test' | 'live' | null;
  keySecretLast4: string | null;
  updatedAt: Date | null;
  /** Append to the API's public address for the Razorpay dashboard's webhook URL. */
  webhookPath: string;
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

  constructor(
    @Inject(ENV) env: Env,
    private readonly api: RazorpayApi,
  ) {
    this.mode = env.PAYMENTS_PROVIDER;
    this.box = SecretBox.fromEnv(env);
  }

  /** The institution's gateway, or null when it cannot take online payments. */
  async forTenant(tx: Tx): Promise<PaymentProvider | null> {
    if (this.mode === 'demo') return new DemoPaymentProvider();
    if (this.mode !== 'razorpay' || !this.box) return null;
    const keys = await this.keys(tx);
    return keys ? new RazorpayProvider(keys.keyId, keys.keySecret, keys.webhookSecret, this.api) : null;
  }

  /** 'razorpay', 'demo' or null, without decrypting anything. */
  async availableName(tx: Tx): Promise<string | null> {
    if (this.mode === 'demo') return 'demo';
    if (this.mode !== 'razorpay') return null;
    const [row] = await tx.select({ keyId: paymentGatewayAccounts.keyId }).from(paymentGatewayAccounts);
    return row ? 'razorpay' : null;
  }

  async view(tx: Tx, tenantSlug: string): Promise<RazorpayAccountView> {
    const [row] = await tx.select().from(paymentGatewayAccounts);
    return {
      provider: this.mode,
      configured: !!row,
      keyId: row?.keyId ?? null,
      mode: row ? keyMode(row.keyId) : null,
      keySecretLast4: row?.keySecretLast4 ?? null,
      updatedAt: row?.updatedAt ?? null,
      webhookPath: `/v1/fees/webhooks/razorpay/${tenantSlug}`,
    };
  }

  /** The decrypted keys of the current institution's account, or null. */
  async keys(tx: Tx): Promise<{ tenantId: string; keyId: string; keySecret: string; webhookSecret: string } | null> {
    const [row] = await tx.select().from(paymentGatewayAccounts);
    if (!row) return null;
    const box = this.requireBox();
    return { tenantId: row.tenantId, keyId: row.keyId, keySecret: box.decrypt(row.keySecretEnc, aad(row.tenantId, 'key_secret')), webhookSecret: box.decrypt(row.webhookSecretEnc, aad(row.tenantId, 'webhook_secret')) };
  }

  /** Saves the account. A secret left out keeps the stored one. Returns what changed. */
  async save(tx: Tx, tenantId: string, userId: string, input: { keyId: string; keySecret?: string; webhookSecret?: string }) {
    const box = this.requireBox();
    const [row] = await tx.select().from(paymentGatewayAccounts);
    const values = {
      keyId: input.keyId,
      ...(input.keySecret ? { keySecretEnc: box.encrypt(input.keySecret, aad(tenantId, 'key_secret')), keySecretLast4: input.keySecret.slice(-4) } : {}),
      ...(input.webhookSecret ? { webhookSecretEnc: box.encrypt(input.webhookSecret, aad(tenantId, 'webhook_secret')) } : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (row) await tx.update(paymentGatewayAccounts).set(values).where(eq(paymentGatewayAccounts.tenantId, tenantId));
    else await tx.insert(paymentGatewayAccounts).values({ tenantId, keySecretEnc: '', keySecretLast4: '', webhookSecretEnc: '', ...values });
    return { created: !row, keyIdChanged: row?.keyId !== input.keyId, keySecretChanged: !!input.keySecret, webhookSecretChanged: !!input.webhookSecret };
  }

  async remove(tx: Tx, tenantId: string): Promise<boolean> {
    const deleted = await tx.delete(paymentGatewayAccounts).where(eq(paymentGatewayAccounts.tenantId, tenantId)).returning({ tenantId: paymentGatewayAccounts.tenantId });
    return deleted.length > 0;
  }

  ping(keys: { keyId: string; keySecret: string }) {
    return this.api.ping(keys);
  }

  private requireBox(): SecretBox {
    if (!this.box) throw new ServiceUnavailableException(SECRETS_KEY_MISSING);
    return this.box;
  }
}
