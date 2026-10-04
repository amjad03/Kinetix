import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
/** An online payment gateway. Razorpay in production: an Indian gateway, data stays in India. */
export class PaymentProvider {
}
const hmacHex = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');
function safeEqual(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}
/** Razorpay Orders API and its signature scheme. */
export class RazorpayProvider extends PaymentProvider {
    constructor(keyId, keySecret, webhookSecret) {
        super();
        this.keyId = keyId;
        this.keySecret = keySecret;
        this.webhookSecret = webhookSecret;
        this.name = 'razorpay';
        this.configured = true;
    }
    async createOrder(o) {
        const res = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ amount: o.amountPaise, currency: 'INR', receipt: o.receipt.slice(0, 40), notes: o.notes }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok)
            throw new Error(`Razorpay order failed: ${res.status}`);
        const body = (await res.json());
        return { orderId: body.id };
    }
    verifyPayment(orderId, paymentId, signature) {
        return safeEqual(hmacHex(this.keySecret, `${orderId}|${paymentId}`), signature);
    }
    verifyWebhook(rawBody, signature) {
        return safeEqual(hmacHex(this.webhookSecret, rawBody), signature);
    }
}
/**
 * For development and demos: orders are made up and the apps "pay" by signing with a known
 * secret. No money moves; the apps label it clearly. Never enable in production.
 */
export class DemoPaymentProvider extends PaymentProvider {
    constructor() {
        super(...arguments);
        this.name = 'demo';
        this.keyId = 'demo';
        this.configured = true;
    }
    static { this.SECRET = 'kinetix-demo-payments'; }
    async createOrder() {
        return { orderId: `demo_order_${randomUUID().replace(/-/g, '').slice(0, 16)}` };
    }
    verifyPayment(orderId, paymentId, signature) {
        return safeEqual(DemoPaymentProvider.sign(orderId, paymentId), signature);
    }
    verifyWebhook(rawBody, signature) {
        return safeEqual(hmacHex(DemoPaymentProvider.SECRET, rawBody), signature);
    }
    static sign(orderId, paymentId) {
        return hmacHex(DemoPaymentProvider.SECRET, `${orderId}|${paymentId}`);
    }
}
export class NoPaymentProvider extends PaymentProvider {
    constructor() {
        super(...arguments);
        this.name = 'none';
        this.keyId = '';
        this.configured = false;
    }
    createOrder() {
        throw new Error('Online payments are not set up');
    }
    verifyPayment() {
        return false;
    }
    verifyWebhook() {
        return false;
    }
}
//# sourceMappingURL=payment-provider.js.map