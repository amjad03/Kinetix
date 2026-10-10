import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** A hosted checkout page the app opens by posting these fields to the gateway (PayU). */
export interface HostedCheckout {
  url: string;
  method: 'POST';
  fields: Record<string, string>;
}

export interface Order {
  orderId: string;
  /** Present for gateways whose checkout is a hosted page rather than an in-app SDK. */
  hosted?: HostedCheckout;
}

/** Who is paying, for gateways whose checkout needs it up front. */
export interface Payer {
  name: string;
  email: string;
  phone: string;
}

export interface OrderInput {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
  payer?: Payer;
  /** Where the gateway sends the browser after payment (hosted checkouts). */
  returnUrl?: string;
}

/** One line of a gateway's settlement: a payment or refund and what was paid out for it. */
export interface GatewaySettlementLine {
  kind: 'payment' | 'refund';
  providerPaymentId: string;
  providerOrderId: string | null;
  amountPaise: number;
  feePaise: number;
  netPaise: number;
}

export interface GatewaySettlement {
  reference: string;
  settlementDate: string;
  lines: GatewaySettlementLine[];
}

export const paiseToRupees = (paise: number) => (paise / 100).toFixed(2);
export const rupeesToPaise = (r: string | number) => Math.round(Number(r) * 100);
export const sha512 = (s: string) => createHash('sha512').update(s).digest('hex');

/** Settlements the fake gateways report (tests set this). */
export const fakeSettlements: { current: GatewaySettlement | null } = { current: null };

/** An institution's Razorpay API keys (its own account: fees settle there). */
export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

/** The result of "Test connection": ok, or a stable error code the ERP words. */
export type PingResult = { ok: true } | { ok: false; error: 'AUTHENTICATION_FAILED' | 'GATEWAY_ERROR' | 'NETWORK_ERROR'; status?: number };

/**
 * The common gateway interface: one institution's account at Razorpay or PayU (or the demo).
 * Create an order, open the hosted or SDK checkout, verify the payment and the webhook, refund,
 * and fetch the settlement for reconciliation.
 */
export abstract class PaymentProvider {
  /** 'razorpay', 'payu' or 'demo'. */
  abstract readonly name: string;
  /** The public key the app's checkout needs. */
  abstract readonly keyId: string;
  abstract createOrder(o: OrderInput): Promise<Order>;
  /** The signature the checkout returns after payment (`fields` is the gateway's whole response for hosted checkouts). */
  abstract verifyPayment(orderId: string, paymentId: string, signature: string, fields?: Record<string, string>): boolean;
  /** A webhook's signature over its raw body. */
  abstract verifyWebhook(rawBody: Buffer, signature: string): boolean;
  /** Refunds all or part of a captured payment at the gateway. */
  abstract refund(o: { providerPaymentId: string; amountPaise: number; refundRef: string }): Promise<{ refundId: string }>;
  /** The gateway's settlement for a day, pulled by API (for reconciliation); null when it paid nothing out. */
  abstract fetchSettlement(day: string): Promise<GatewaySettlement | null>;
}

export const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ----- Razorpay ----------------------------------------------------------------------------------------

/** Razorpay's REST API, called with one institution's keys. */
export abstract class RazorpayApi {
  abstract createOrder(keys: RazorpayKeys, o: OrderInput): Promise<Order>;
  /** A harmless authenticated call (list one order) to check the keys work. */
  abstract ping(keys: RazorpayKeys): Promise<PingResult>;
  abstract refund(keys: RazorpayKeys, o: { providerPaymentId: string; amountPaise: number; refundRef: string }): Promise<{ refundId: string }>;
  abstract settlement(keys: RazorpayKeys, day: string): Promise<GatewaySettlement | null>;
}

const basic = (k: RazorpayKeys) => `Basic ${Buffer.from(`${k.keyId}:${k.keySecret}`).toString('base64')}`;

export class HttpRazorpayApi extends RazorpayApi {
  async createOrder(keys: RazorpayKeys, o: OrderInput): Promise<Order> {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { authorization: basic(keys), 'content-type': 'application/json' },
      body: JSON.stringify({ amount: o.amountPaise, currency: 'INR', receipt: o.receipt.slice(0, 40), notes: o.notes }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
    const body = (await res.json()) as { id: string };
    return { orderId: body.id };
  }

  async refund(keys: RazorpayKeys, o: { providerPaymentId: string; amountPaise: number; refundRef: string }): Promise<{ refundId: string }> {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(o.providerPaymentId)}/refund`, {
      method: 'POST',
      headers: { authorization: basic(keys), 'content-type': 'application/json' },
      body: JSON.stringify({ amount: o.amountPaise, receipt: o.refundRef.slice(0, 40) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Razorpay refund failed: ${res.status}`);
    return { refundId: ((await res.json()) as { id: string }).id };
  }

  async settlement(keys: RazorpayKeys, day: string): Promise<GatewaySettlement | null> {
    const [y, m, d] = day.split('-').map(Number);
    const res = await fetch(`https://api.razorpay.com/v1/settlements/recon/combined?year=${y}&month=${m}&day=${d}&count=100`, { headers: { authorization: basic(keys) }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Razorpay settlement fetch failed: ${res.status}`);
    const body = (await res.json()) as { items?: { entity_id: string; type: string; order_id?: string; amount: number; fee: number; tax: number; credit: number; debit: number; settlement_id?: string }[] };
    const items = (body.items ?? []).filter((i) => i.type === 'payment' || i.type === 'refund');
    if (!items.length) return null;
    return {
      reference: items[0].settlement_id ?? `rzp-${day}`,
      settlementDate: day,
      lines: items.map((i) => ({ kind: i.type as 'payment' | 'refund', providerPaymentId: i.entity_id, providerOrderId: i.order_id ?? null, amountPaise: i.amount, feePaise: i.fee + i.tax, netPaise: i.type === 'payment' ? i.credit : -i.debit })),
    };
  }

  async ping(keys: RazorpayKeys): Promise<PingResult> {
    try {
      const res = await fetch('https://api.razorpay.com/v1/orders?count=1', { headers: { authorization: basic(keys) }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { ok: true };
      return { ok: false, error: res.status === 401 ? 'AUTHENTICATION_FAILED' : 'GATEWAY_ERROR', status: res.status };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  }
}

/**
 * RAZORPAY_FAKE=true (tests, local e2e): no calls leave the machine. Orders are made up; a key
 * secret starting with "wrong" fails "Test connection" the way Razorpay answers bad keys (401).
 */
export class FakeRazorpayApi extends RazorpayApi {
  async createOrder(): Promise<Order> {
    return { orderId: `order_fake${randomUUID().replace(/-/g, '').slice(0, 14)}` };
  }

  async refund(): Promise<{ refundId: string }> {
    return { refundId: `rfnd_fake${randomUUID().replace(/-/g, '').slice(0, 12)}` };
  }

  async settlement(): Promise<GatewaySettlement | null> {
    return fakeSettlements.current;
  }

  async ping(keys: RazorpayKeys): Promise<PingResult> {
    return keys.keySecret.startsWith('wrong') ? { ok: false, error: 'AUTHENTICATION_FAILED', status: 401 } : { ok: true };
  }
}

/** One institution's Razorpay account: its keys, its webhook secret, its money. */
export class RazorpayProvider extends PaymentProvider {
  readonly name = 'razorpay';

  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
    private readonly api: RazorpayApi,
  ) {
    super();
  }

  createOrder(o: OrderInput): Promise<Order> {
    return this.api.createOrder({ keyId: this.keyId, keySecret: this.keySecret }, o);
  }

  verifyPayment(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqual(hmacHex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    return safeEqual(hmacHex(this.webhookSecret, rawBody), signature);
  }

  refund(o: { providerPaymentId: string; amountPaise: number; refundRef: string }) {
    return this.api.refund({ keyId: this.keyId, keySecret: this.keySecret }, o);
  }

  fetchSettlement(day: string) {
    return this.api.settlement({ keyId: this.keyId, keySecret: this.keySecret }, day);
  }
}

// ----- PayU --------------------------------------------------------------------------------------------

/** An institution's PayU merchant key and salt (its own account). */
export interface PayuKeys {
  key: string;
  salt: string;
}

/** PayU's server-to-server API (test connection, refund, settlement), called with one institution's key and salt. */
export abstract class PayuApi {
  abstract ping(keys: PayuKeys): Promise<PingResult>;
  abstract refund(keys: PayuKeys, o: { providerPaymentId: string; amountPaise: number; refundRef: string }): Promise<{ refundId: string }>;
  abstract settlement(keys: PayuKeys, day: string): Promise<GatewaySettlement | null>;
}

/** PayU hosts: the sandbox (default) or live. */
export const payuHosts = (mode: 'test' | 'live') =>
  mode === 'live'
    ? { pay: 'https://secure.payu.in/_payment', api: 'https://info.payu.in/merchant/postservice.php?form=2' }
    : { pay: 'https://test.payu.in/_payment', api: 'https://test.payu.in/merchant/postservice.php?form=2' };

export class HttpPayuApi extends PayuApi {
  constructor(private readonly mode: 'test' | 'live') {
    super();
  }

  private async call(keys: PayuKeys, command: string, var1: string, extra: Record<string, string> = {}): Promise<Record<string, any>> {
    const body = new URLSearchParams({ key: keys.key, command, var1, hash: sha512(`${keys.key}|${command}|${var1}|${keys.salt}`), ...extra });
    const res = await fetch(payuHosts(this.mode).api, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`PayU ${command} failed: ${res.status}`);
    return (await res.json()) as Record<string, any>;
  }

  async ping(keys: PayuKeys): Promise<PingResult> {
    try {
      const r = await this.call(keys, 'verify_payment', 'kinetix-ping');
      return /invalid|incorrect|authent/i.test(String(r.msg ?? '')) && /hash|key|authent/i.test(String(r.msg)) ? { ok: false, error: 'AUTHENTICATION_FAILED' } : { ok: true };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  }

  async refund(keys: PayuKeys, o: { providerPaymentId: string; amountPaise: number; refundRef: string }): Promise<{ refundId: string }> {
    const r = await this.call(keys, 'cancel_refund_transaction', o.providerPaymentId, { var2: o.refundRef.slice(0, 23), var3: paiseToRupees(o.amountPaise) });
    if (Number(r.status) !== 1) throw new Error(`PayU refund failed: ${String(r.msg ?? 'unknown')}`);
    return { refundId: String(r.request_id ?? r.mihpayid ?? o.refundRef) };
  }

  async settlement(keys: PayuKeys, day: string): Promise<GatewaySettlement | null> {
    const r = await this.call(keys, 'get_settlement_details', day);
    const rows = (r.Txn_details ?? r.transactions ?? []) as { payuid?: string; mihpayid?: string; txnid?: string; amount?: string; net_amount?: string; service_fee?: string; service_tax?: string; type?: string }[];
    if (!rows.length) return null;
    return {
      reference: String(r.utr ?? r.settlement_id ?? `payu-${day}`),
      settlementDate: day,
      lines: rows.map((t) => {
        const amount = rupeesToPaise(t.amount ?? 0);
        const fee = rupeesToPaise(t.service_fee ?? 0) + rupeesToPaise(t.service_tax ?? 0);
        return { kind: /refund/i.test(t.type ?? '') ? ('refund' as const) : ('payment' as const), providerPaymentId: String(t.mihpayid ?? t.payuid ?? ''), providerOrderId: t.txnid ?? null, amountPaise: amount, feePaise: fee, netPaise: t.net_amount ? rupeesToPaise(t.net_amount) : amount - fee };
      }),
    };
  }
}

/** PAYU_FAKE=true (tests, local e2e): no calls leave the machine; a salt starting with "wrong" fails "Test connection". */
export class FakePayuApi extends PayuApi {
  async ping(keys: PayuKeys): Promise<PingResult> {
    return keys.salt.startsWith('wrong') ? { ok: false, error: 'AUTHENTICATION_FAILED', status: 401 } : { ok: true };
  }

  async refund(): Promise<{ refundId: string }> {
    return { refundId: `payu_rf_${randomUUID().replace(/-/g, '').slice(0, 12)}` };
  }

  async settlement(): Promise<GatewaySettlement | null> {
    return fakeSettlements.current;
  }
}

/** PayU's request hash: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3..udf5||||||salt. */
export const payuRequestHash = (key: string, salt: string, f: { txnid: string; amount: string; productinfo: string; firstname: string; email: string; udf1?: string; udf2?: string }) =>
  sha512([key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1 ?? '', f.udf2 ?? '', '', '', '', '', '', '', salt].join('|'));

/** PayU's response (reverse) hash: salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key. */
export const payuResponseHash = (key: string, salt: string, f: Record<string, string>) =>
  sha512([salt, f.status ?? '', '', '', '', '', '', f.udf5 ?? '', f.udf4 ?? '', f.udf3 ?? '', f.udf2 ?? '', f.udf1 ?? '', f.email ?? '', f.firstname ?? '', f.productinfo ?? '', f.amount ?? '', f.txnid ?? '', key].join('|'));

/** One institution's PayU account: merchant key + salt; the salt also signs responses and webhooks. */
export class PayuProvider extends PaymentProvider {
  readonly name = 'payu';

  constructor(
    readonly keyId: string,
    private readonly salt: string,
    private readonly api: PayuApi,
    private readonly mode: 'test' | 'live',
  ) {
    super();
  }

  async createOrder(o: OrderInput): Promise<Order> {
    const txnid = `kx${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const amount = paiseToRupees(o.amountPaise);
    const payer = o.payer ?? { name: 'Parent', email: '', phone: '' };
    const email = payer.email || 'noreply@kinetix.invalid';
    const firstname = payer.name.split(' ')[0]?.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 40) || 'Parent';
    const productinfo = o.receipt.slice(0, 100);
    const udf1 = o.notes.tenantId ?? '';
    const udf2 = o.notes.invoiceId ?? '';
    const fields: Record<string, string> = {
      key: this.keyId,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone: payer.phone,
      udf1,
      udf2,
      surl: o.returnUrl ?? '',
      furl: o.returnUrl ?? '',
      hash: payuRequestHash(this.keyId, this.salt, { txnid, amount, productinfo, firstname, email, udf1, udf2 }),
    };
    return { orderId: txnid, hosted: { url: payuHosts(this.mode).pay, method: 'POST', fields } };
  }

  verifyPayment(orderId: string, paymentId: string, signature: string, fields?: Record<string, string>): boolean {
    if (!fields || fields.txnid !== orderId || fields.mihpayid !== paymentId || fields.status !== 'success') return false;
    return safeEqual(payuResponseHash(this.keyId, this.salt, fields), signature);
  }

  /** The webhook is PayU's form post: its own `hash` field (passed as the signature) proves it. */
  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    const f = Object.fromEntries(new URLSearchParams(rawBody.toString('utf8')));
    return !!signature && safeEqual(payuResponseHash(this.keyId, this.salt, f), signature);
  }

  refund(o: { providerPaymentId: string; amountPaise: number; refundRef: string }) {
    return this.api.refund({ key: this.keyId, salt: this.salt }, o);
  }

  fetchSettlement(day: string) {
    return this.api.settlement({ key: this.keyId, salt: this.salt }, day);
  }
}

// ----- Demo --------------------------------------------------------------------------------------------

/**
 * For development and demos: orders are made up and the apps "pay" by signing with a known
 * secret. No money moves; the apps label it clearly. Never enable in production.
 */
export class DemoPaymentProvider extends PaymentProvider {
  static readonly SECRET = 'kinetix-demo-payments';
  readonly name = 'demo';
  readonly keyId = 'demo';

  async createOrder(): Promise<Order> {
    return { orderId: `demo_order_${randomUUID().replace(/-/g, '').slice(0, 16)}` };
  }

  verifyPayment(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqual(DemoPaymentProvider.sign(orderId, paymentId), signature);
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    return safeEqual(hmacHex(DemoPaymentProvider.SECRET, rawBody), signature);
  }

  async refund(): Promise<{ refundId: string }> {
    return { refundId: `demo_refund_${randomUUID().replace(/-/g, '').slice(0, 12)}` };
  }

  async fetchSettlement(): Promise<GatewaySettlement | null> {
    return null;
  }

  static sign(orderId: string, paymentId: string): string {
    return hmacHex(DemoPaymentProvider.SECRET, `${orderId}|${paymentId}`);
  }
}
