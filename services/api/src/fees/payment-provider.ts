import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface Order {
  orderId: string;
}

/** An institution's Razorpay API keys (its own account: fees settle there). */
export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

/** The result of "Test connection": ok, or a stable error code the ERP words. */
export type PingResult = { ok: true } | { ok: false; error: 'AUTHENTICATION_FAILED' | 'GATEWAY_ERROR' | 'NETWORK_ERROR'; status?: number };

/** One online payment gateway account: the institution's Razorpay keys, or the demo. */
export abstract class PaymentProvider {
  /** 'razorpay' or 'demo'. */
  abstract readonly name: string;
  /** The public key the app's checkout needs. */
  abstract readonly keyId: string;
  abstract createOrder(o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<Order>;
  /** The signature the checkout returns after payment. */
  abstract verifyPayment(orderId: string, paymentId: string, signature: string): boolean;
  /** A webhook's signature over its raw body. */
  abstract verifyWebhook(rawBody: Buffer, signature: string): boolean;
}

export const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Razorpay's REST API, called with one institution's keys. */
export abstract class RazorpayApi {
  abstract createOrder(keys: RazorpayKeys, o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<Order>;
  /** A harmless authenticated call (list one order) to check the keys work. */
  abstract ping(keys: RazorpayKeys): Promise<PingResult>;
}

const basic = (k: RazorpayKeys) => `Basic ${Buffer.from(`${k.keyId}:${k.keySecret}`).toString('base64')}`;

export class HttpRazorpayApi extends RazorpayApi {
  async createOrder(keys: RazorpayKeys, o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<Order> {
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

  createOrder(o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<Order> {
    return this.api.createOrder({ keyId: this.keyId, keySecret: this.keySecret }, o);
  }

  verifyPayment(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqual(hmacHex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    return safeEqual(hmacHex(this.webhookSecret, rawBody), signature);
  }
}

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

  static sign(orderId: string, paymentId: string): string {
    return hmacHex(DemoPaymentProvider.SECRET, `${orderId}|${paymentId}`);
  }
}
