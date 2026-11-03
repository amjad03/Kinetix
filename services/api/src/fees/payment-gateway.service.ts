import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { SecretBox } from '../common/secret-box.js';
import type { Tx } from '../db/db.service.js';
import { paymentGatewayAccounts } from '../db/schema.js';
import { feeAccounts } from '../db/schema-fee-flagship.js';
import { CashfreeProvider, CcavenueProvider, EasebuzzProvider, type GatewayMode } from './gateways.js';
import { DemoPaymentProvider, HttpPayuApi, PayuApi, PayuProvider, type PaymentProvider, type PingResult, RazorpayApi, RazorpayProvider } from './payment-provider.js';

/** The message (and so the code PAYMENTS_NOT_CONFIGURED) when an institution cannot take online payments. */
export const PAYMENTS_NOT_CONFIGURED = 'Online payment is not available yet. Please pay at the fees counter.';
export const SECRETS_KEY_MISSING = 'Payment keys cannot be stored on this server yet (SECRETS_ENCRYPTION_KEY is not set)';

export const GATEWAYS = ['razorpay', 'payu', 'cashfree', 'easebuzz', 'ccavenue'] as const;
export type GatewayName = (typeof GATEWAYS)[number];

/** What the ERP may see of an institution's Razorpay account: never a secret. */
export interface RazorpayAccountView {
  /** The server's payment mode: gateways (live), demo (no money moves) or none. */
  provider: Env['PAYMENTS_PROVIDER'];
  /** The gateway this institution chose (null until it saves one). */
  gateway: GatewayName | null;
  configured: boolean;
  keyId: string | null;
  mode: 'test' | 'live' | null;
  keySecretLast4: string | null;
  updatedAt: Date | null;
  /** Append to the API's public address for the Razorpay dashboard's webhook URL. */
  webhookPath: string;
  /** The same for PayU's dashboard. */
  payuWebhookPath: string;
}

/** One saved gateway account as the ERP lists it (per fee account, or the institution's default). */
export interface GatewayAccountView {
  id: string;
  feeAccountId: string | null;
  feeAccount: string | null;
  provider: GatewayName;
  mode: GatewayMode;
  keyId: string;
  accessCode: string | null;
  keySecretLast4: string;
  active: boolean;
  updatedAt: Date;
  /** Append to the API's public address: the URL to paste into the gateway's dashboard. */
  webhookPath: string;
}

export interface GatewayKeys {
  id: string;
  tenantId: string;
  feeAccountId: string | null;
  provider: string;
  mode: GatewayMode;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  accessCode: string | null;
}

export const keyMode = (keyId: string): 'test' | 'live' => (keyId.startsWith('rzp_live_') ? 'live' : 'test');
/** The default account keeps the associated data it always had; a fee account's credentials are bound to it. */
const aad = (tenantId: string, feeAccountId: string | null, field: 'key_secret' | 'webhook_secret') => (feeAccountId ? `${tenantId}:${feeAccountId}:gateway.${field}` : `${tenantId}:razorpay.${field}`);
export const gatewayAad = aad;

type Row = typeof paymentGatewayAccounts.$inferSelect;

/**
 * Each institution receives fees in its own gateway account, and each fee account (trust, college, hostel) may have
 * its own. This finds the gateway for an invoice's fee account (its own, else the institution's default), decrypting
 * the secrets with the master key; row-level security scopes every lookup to the current institution. In demo mode
 * every institution gets the demo gateway.
 */
@Injectable()
export class PaymentGateway {
  readonly mode: Env['PAYMENTS_PROVIDER'];
  private readonly box: SecretBox | undefined;
  private readonly testBase: string | undefined;
  private readonly payuFake: boolean;
  /** PAYU_MODE=live keeps every PayU account live, as before accounts had their own mode. */
  private readonly payuLive: boolean;

  constructor(
    @Inject(ENV) env: Env,
    private readonly api: RazorpayApi,
    private readonly payu: PayuApi,
  ) {
    this.mode = env.PAYMENTS_PROVIDER;
    this.box = SecretBox.fromEnv(env);
    this.testBase = env.PAYMENT_GATEWAY_TEST_BASE?.replace(/\/+$/, '');
    this.payuFake = env.PAYU_FAKE;
    this.payuLive = env.PAYU_MODE === 'live';
  }

  /** The provider for a decrypted account. */
  providerOf(k: GatewayKeys): PaymentProvider {
    const base = k.mode === 'test' ? this.testBase : undefined;
    switch (k.provider) {
      case 'payu':
        return new PayuProvider(k.keyId, k.keySecret, this.payuFake ? this.payu : new HttpPayuApi(k.mode, base ? `${base}/payu` : undefined), k.mode, base ? `${base}/payu/_payment` : undefined);
      case 'cashfree':
        return new CashfreeProvider(k.keyId, k.keySecret, k.mode, base);
      case 'easebuzz':
        return new EasebuzzProvider(k.keyId, k.keySecret, k.mode, k.accessCode, base);
      case 'ccavenue':
        return new CcavenueProvider(k.keyId, k.keySecret, k.accessCode ?? '', k.mode, base);
      default:
        return new RazorpayProvider(k.keyId, k.keySecret, k.webhookSecret, this.api);
    }
  }

  /** The institution's default gateway, or null when it cannot take online payments. */
  async forTenant(tx: Tx): Promise<PaymentProvider | null> {
    return (await this.forFeeAccount(tx, null))?.provider ?? null;
  }

  /** The gateway a fee account collects through (its own account, else the institution's default). */
  async forFeeAccount(tx: Tx, feeAccountId: string | null): Promise<{ provider: PaymentProvider; accountId: string | null } | null> {
    if (this.mode === 'demo') return { provider: new DemoPaymentProvider(), accountId: null };
    if (this.mode === 'none' || !this.box) return null;
    const own = feeAccountId ? await this.row(tx, feeAccountId) : undefined;
    const row = own?.active ? own : await this.row(tx, null);
    if (!row?.active) return null;
    return { provider: this.providerOf(this.decrypt(row)), accountId: row.id };
  }

  /** The gateway an online payment was ordered with (so its webhook and status are checked with the same keys). */
  async forAccountId(tx: Tx, id: string | null): Promise<PaymentProvider | null> {
    if (this.mode === 'demo') return new DemoPaymentProvider();
    if (this.mode === 'none' || !this.box) return null;
    if (!id) return this.forTenant(tx);
    const [row] = await tx.select().from(paymentGatewayAccounts).where(eq(paymentGatewayAccounts.id, id));
    return row ? this.providerOf(this.decrypt(row)) : null;
  }

  /** Every saved account of a provider (a webhook URL names the provider, not the fee account). */
  async allOf(tx: Tx, provider: string): Promise<{ id: string; provider: PaymentProvider }[]> {
    // In demo mode the demo gateway answers to the Razorpay-shaped webhook.
    if (this.mode === 'demo') return provider === 'razorpay' ? [{ id: 'demo', provider: new DemoPaymentProvider() }] : [];
    if (this.mode === 'none' || !this.box) return [];
    const rows = await tx.select().from(paymentGatewayAccounts).where(eq(paymentGatewayAccounts.provider, provider));
    return rows.map((r) => ({ id: r.id, provider: this.providerOf(this.decrypt(r)) }));
  }

  /** The gateway name for the apps ('razorpay', 'payu', …, 'demo' or null), without decrypting anything. */
  async availableName(tx: Tx, feeAccountId: string | null = null): Promise<string | null> {
    if (this.mode === 'demo') return 'demo';
    if (this.mode === 'none') return null;
    const own = feeAccountId ? await this.row(tx, feeAccountId) : undefined;
    const row = own?.active ? own : await this.row(tx, null);
    return row?.active ? row.provider : null;
  }

  /** The default account as the older Settings page shows it. */
  async view(tx: Tx, tenantSlug: string): Promise<RazorpayAccountView> {
    const row = await this.row(tx, null);
    return {
      provider: this.mode,
      gateway: row ? (row.provider as GatewayName) : null,
      configured: !!row,
      keyId: row?.keyId ?? null,
      mode: row ? this.modeOf(row) : null,
      keySecretLast4: row?.keySecretLast4 ?? null,
      updatedAt: row?.updatedAt ?? null,
      webhookPath: `/v1/fees/webhooks/razorpay/${tenantSlug}`,
      payuWebhookPath: `/v1/fees/webhooks/payu/${tenantSlug}`,
    };
  }

  /** Every saved account (default first), never a secret. */
  async list(tx: Tx, tenantSlug: string): Promise<GatewayAccountView[]> {
    const rows = await tx.select({ g: paymentGatewayAccounts, account: feeAccounts.name }).from(paymentGatewayAccounts).leftJoin(feeAccounts, eq(feeAccounts.id, paymentGatewayAccounts.feeAccountId)).orderBy(asc(feeAccounts.sortOrder), asc(feeAccounts.name));
    return rows
      .sort((a, b) => Number(!!a.g.feeAccountId) - Number(!!b.g.feeAccountId))
      .map(({ g, account }) => ({
        id: g.id,
        feeAccountId: g.feeAccountId,
        feeAccount: account,
        provider: g.provider as GatewayName,
        mode: this.modeOf(g),
        keyId: g.keyId,
        accessCode: g.accessCode,
        keySecretLast4: g.keySecretLast4,
        active: g.active,
        updatedAt: g.updatedAt,
        webhookPath: `/v1/fees/webhooks/${g.provider}/${tenantSlug}`,
      }));
  }

  /** The decrypted keys of the default account (or a fee account's own), or null. */
  async keys(tx: Tx, feeAccountId: string | null = null): Promise<GatewayKeys | null> {
    const row = await this.row(tx, feeAccountId);
    return row ? this.decrypt(row) : null;
  }

  async keysById(tx: Tx, id: string): Promise<GatewayKeys | null> {
    const [row] = await tx.select().from(paymentGatewayAccounts).where(eq(paymentGatewayAccounts.id, id));
    return row ? this.decrypt(row) : null;
  }

  /** Saves the default account or a fee account's own. A secret left out keeps the stored one. Returns what changed. */
  async save(
    tx: Tx,
    tenantId: string,
    userId: string,
    input: { provider?: GatewayName; keyId: string; keySecret?: string; webhookSecret?: string; mode?: GatewayMode; accessCode?: string | null; active?: boolean },
    feeAccountId: string | null = null,
  ) {
    const box = this.requireBox();
    const row = await this.row(tx, feeAccountId);
    const provider = input.provider ?? 'razorpay';
    const values = {
      provider,
      keyId: input.keyId,
      mode: provider === 'razorpay' ? keyMode(input.keyId) : (input.mode ?? (row?.mode as GatewayMode | undefined) ?? 'test'),
      accessCode: input.accessCode === undefined ? (row?.accessCode ?? null) : input.accessCode,
      active: input.active ?? row?.active ?? true,
      ...(input.keySecret ? { keySecretEnc: box.encrypt(input.keySecret, aad(tenantId, feeAccountId, 'key_secret')), keySecretLast4: input.keySecret.slice(-4) } : {}),
      ...(input.webhookSecret ? { webhookSecretEnc: box.encrypt(input.webhookSecret, aad(tenantId, feeAccountId, 'webhook_secret')) } : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (row) await tx.update(paymentGatewayAccounts).set(values).where(eq(paymentGatewayAccounts.id, row.id));
    else await tx.insert(paymentGatewayAccounts).values({ tenantId, feeAccountId, keySecretEnc: '', keySecretLast4: '', webhookSecretEnc: '', ...values });
    return { created: !row, keyIdChanged: row?.keyId !== input.keyId, keySecretChanged: !!input.keySecret, providerChanged: !!row && row.provider !== provider, webhookSecretChanged: !!input.webhookSecret, mode: values.mode };
  }

  async remove(tx: Tx, tenantId: string, feeAccountId: string | null = null): Promise<boolean> {
    const deleted = await tx
      .delete(paymentGatewayAccounts)
      .where(and(eq(paymentGatewayAccounts.tenantId, tenantId), feeAccountId ? eq(paymentGatewayAccounts.feeAccountId, feeAccountId) : isNull(paymentGatewayAccounts.feeAccountId)))
      .returning({ id: paymentGatewayAccounts.id });
    return deleted.length > 0;
  }

  /** "Test connection": a harmless authenticated call to the gateway with these keys. */
  ping(keys: { provider?: string; keyId: string; keySecret: string; mode?: GatewayMode; accessCode?: string | null; webhookSecret?: string; id?: string; tenantId?: string; feeAccountId?: string | null }): Promise<PingResult> {
    if (!keys.provider || keys.provider === 'razorpay') return this.api.ping(keys);
    if (keys.provider === 'payu') return (this.payuFake ? this.payu : new HttpPayuApi(keys.mode ?? 'test', keys.mode === 'test' && this.testBase ? `${this.testBase}/payu` : undefined)).ping({ key: keys.keyId, salt: keys.keySecret });
    const p = this.providerOf({ id: keys.id ?? '', tenantId: keys.tenantId ?? '', feeAccountId: keys.feeAccountId ?? null, provider: keys.provider, mode: keys.mode ?? 'test', keyId: keys.keyId, keySecret: keys.keySecret, webhookSecret: keys.webhookSecret ?? keys.keySecret, accessCode: keys.accessCode ?? null });
    return (p as CashfreeProvider | EasebuzzProvider | CcavenueProvider).ping();
  }

  private modeOf(row: Pick<Row, 'provider' | 'keyId' | 'mode'>): GatewayMode {
    if (row.provider === 'razorpay') return keyMode(row.keyId);
    if (row.provider === 'payu' && this.payuLive) return 'live';
    return row.mode === 'live' ? 'live' : 'test';
  }

  private async row(tx: Tx, feeAccountId: string | null): Promise<Row | undefined> {
    const [row] = await tx.select().from(paymentGatewayAccounts).where(feeAccountId ? eq(paymentGatewayAccounts.feeAccountId, feeAccountId) : isNull(paymentGatewayAccounts.feeAccountId));
    return row;
  }

  private decrypt(row: Row): GatewayKeys {
    const box = this.requireBox();
    return {
      id: row.id,
      tenantId: row.tenantId,
      feeAccountId: row.feeAccountId,
      provider: row.provider,
      mode: this.modeOf(row),
      keyId: row.keyId,
      keySecret: box.decrypt(row.keySecretEnc, aad(row.tenantId, row.feeAccountId, 'key_secret')),
      webhookSecret: row.webhookSecretEnc ? box.decrypt(row.webhookSecretEnc, aad(row.tenantId, row.feeAccountId, 'webhook_secret')) : '',
      accessCode: row.accessCode,
    };
  }

  private requireBox(): SecretBox {
    if (!this.box) throw new ServiceUnavailableException(SECRETS_KEY_MISSING);
    return this.box;
  }
}
