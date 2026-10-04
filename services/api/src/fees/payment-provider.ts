import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface Order {
  orderId: string;
}

/** An online payment gateway. Razorpay in production: an Indian gateway, data stays in India. */
export abstract class PaymentProvider {
  /** 'razorpay', 'demo' or 'none'. */
  abstract readonly name: string;
  /** The public key the app's checkout needs. */
  abstract readonly keyId: string;
  abstract readonly configured: boolean;
  abstract createOrder(o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<Order>;
  /** The signature the checkout returns after payment. */
  abstract verifyPayment(orderId: string, paymentId: string, signature: string): boolean;
  /** A webhook's signature over its raw body. */
  abstract verifyWebhook(rawBody: Buffer, signature: string): boolean;
}

const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Razorpay Orders API and its signature scheme. */
export class RazorpayProvider extends PaymentProvider {
  readonly name = 'razorpay';
  readonly configured = true;

  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {
    super();
  }

  async createOrder(o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<Order> {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: o.amountPaise, currency: 'INR', receipt: o.receipt.slice(0, 40), notes: o.notes }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
    const body = (await res.json()) as { id: string };
    return { orderId: body.id };
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
  readonly configured = true;

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

export class NoPaymentProvider extends PaymentProvider {
  readonly name = 'none';
  readonly keyId = '';
  readonly configured = false;
  createOrder(): Promise<Order> {
    throw new Error('Online payments are not set up');
  }
  verifyPayment(): boolean {
    return false;
  }
  verifyWebhook(): boolean {
    return false;
  }
}
