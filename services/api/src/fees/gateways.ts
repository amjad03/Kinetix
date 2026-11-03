import { createCipheriv, createDecipheriv, createHash, createHmac, randomUUID } from 'node:crypto';
import {
  firstNameOf,
  formFields,
  type GatewaySettlement,
  type GatewayStatus,
  type Order,
  type OrderInput,
  paiseToRupees,
  PaymentProvider,
  type PingResult,
  readJson,
  type RefundInput,
  rupeesToPaise,
  safeEqual,
  sha512,
  type WebhookRead,
} from './payment-provider.js';

/**
 * Cashfree, Easebuzz and CCAvenue, each called over HTTP with one account's credentials in that gateway's sandbox
 * (test) or live hosts. Requests and checks follow each gateway's published integration documents:
 *
 * - Cashfree Payments PG API (x-api-version 2023-08-01): orders, order payments, refunds, settlement recon; webhooks
 *   signed base64(HMAC-SHA256(x-webhook-timestamp + raw body, client secret)) in x-webhook-signature.
 * - Easebuzz: initiateLink (hosted /pay/<access key>), Transaction API v2.1, Refund API v2, Settlements API; request
 *   and response hashes are SHA-512 over the documented pipe-joined fields with the salt.
 * - CCAvenue: AES-128-CBC with the MD5 of the working key and the fixed IV 0..15, hex; encRequest to
 *   /transaction/transaction.do, encResp back; the API (orderStatusTracker, refundOrder, payoutSummary,
 *   getSettlementDetails) at /apis/servlet/DoWebTrans with enc_request and access_code.
 *
 * In tests PAYMENT_GATEWAY_TEST_BASE points every host at a local stand-in that answers with those documents' sample
 * payloads, so the code here runs exactly as it would against the sandbox.
 */

export type GatewayMode = 'test' | 'live';
export type Fetch = typeof fetch;

const timeout = (ms: number) => AbortSignal.timeout(ms);

/** "2026-10-20" → "20-10-2026" (CCAvenue's and Easebuzz's date format). */
const dmy = (day: string) => day.split('-').reverse().join('-');
const noFail = (e: unknown) => (e as Error).message.slice(0, 200);

// ----- Cashfree ---------------------------------------------------------------------------------------

export const cashfreeHosts = (mode: GatewayMode, base?: string) => (base ? `${base}/cashfree/pg` : mode === 'live' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');

/** Cashfree's webhook signature: base64 HMAC-SHA256 of the timestamp header followed by the raw body. */
export const cashfreeSignature = (secret: string, timestamp: string, rawBody: Buffer | string) => createHmac('sha256', secret).update(timestamp + (typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))).digest('base64');

/** One account at Cashfree: the app id (x-client-id) and secret key (x-client-secret, which also signs webhooks). */
export class CashfreeProvider extends PaymentProvider {
  readonly name = 'cashfree';
  private readonly host: string;

  constructor(
    readonly keyId: string,
    private readonly secret: string,
    private readonly mode: GatewayMode,
    base?: string,
    private readonly http: Fetch = fetch,
  ) {
    super();
    this.host = cashfreeHosts(mode, base);
  }

  private headers(json = true): Record<string, string> {
    return { 'x-client-id': this.keyId, 'x-client-secret': this.secret, 'x-api-version': '2023-08-01', accept: 'application/json', ...(json ? { 'content-type': 'application/json' } : {}) };
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const res = await this.http(`${this.host}${path}`, { method, headers: this.headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body), signal: timeout(20_000) });
    const text = await res.text();
    return { status: res.status, body: (readJson<T>(text) ?? ({} as T)) as T };
  }

  async createOrder(o: OrderInput): Promise<Order> {
    const orderId = `kx_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const payer = o.payer ?? { name: 'Parent', email: '', phone: '' };
    const phone = payer.phone.replace(/\D/g, '').slice(-10) || '9999999999';
    const r = await this.call<{ order_id?: string; payment_session_id?: string; message?: string }>('POST', '/orders', {
      order_id: orderId,
      order_amount: Number(paiseToRupees(o.amountPaise)),
      order_currency: 'INR',
      customer_details: { customer_id: (o.notes.studentId ?? o.notes.invoiceId ?? orderId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50), customer_name: payer.name.slice(0, 100) || 'Parent', customer_email: payer.email || 'noreply@zynetix.invalid', customer_phone: phone },
      order_meta: { return_url: o.returnUrl ? `${o.returnUrl}${o.returnUrl.includes('?') ? '&' : '?'}order_id={order_id}` : undefined, notify_url: o.notifyUrl },
      order_note: o.receipt.slice(0, 200),
      order_tags: Object.fromEntries(Object.entries(o.notes).slice(0, 10).map(([k, v]) => [k, String(v).slice(0, 255)])),
    });
    if (r.status >= 300 || !r.body.payment_session_id) throw new Error(`Cashfree order failed: ${r.status} ${r.body.message ?? ''}`.trim());
    return { orderId: r.body.order_id ?? orderId, session: { id: r.body.payment_session_id, environment: this.mode === 'live' ? 'production' : 'sandbox' } };
  }

  /** Cashfree's checkout returns only to the return URL; the payment is proved by asking the API (fetchStatus). */
  verifyPayment(): boolean {
    return false;
  }

  verifyWebhook(rawBody: Buffer, signature: string, timestamp = ''): boolean {
    return !!signature && !!timestamp && safeEqual(cashfreeSignature(this.secret, timestamp, rawBody), signature);
  }

  readWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): WebhookRead {
    if (!this.verifyWebhook(rawBody, headers['x-webhook-signature'] ?? '', headers['x-webhook-timestamp'] ?? '')) return { ok: false };
    const b = readJson<{ type?: string; data?: { order?: { order_id?: string; order_amount?: number }; payment?: { cf_payment_id?: string | number; payment_status?: string; payment_amount?: number }; refund?: { cf_refund_id?: string | number; cf_payment_id?: string | number; order_id?: string; refund_amount?: number; refund_status?: string } } }>(rawBody);
    const d = b?.data;
    if (b?.type === 'REFUND_STATUS_WEBHOOK' && d?.refund?.order_id && d.refund.refund_status === 'SUCCESS') {
      return { ok: true, event: { key: `refund:${d.refund.cf_refund_id}`, kind: 'refund', orderId: d.refund.order_id, providerPaymentId: String(d.refund.cf_payment_id ?? ''), amountPaise: rupeesToPaise(d.refund.refund_amount ?? 0), status: 'refunded' } };
    }
    if (!d?.order?.order_id || !d.payment?.cf_payment_id) return { ok: true, event: null };
    const status = d.payment.payment_status === 'SUCCESS' ? 'paid' : d.payment.payment_status === 'FAILED' ? 'failed' : null;
    if (!status) return { ok: true, event: null };
    return { ok: true, event: { key: `${b?.type ?? 'payment'}:${d.payment.cf_payment_id}`, kind: 'payment', orderId: d.order.order_id, providerPaymentId: String(d.payment.cf_payment_id), amountPaise: rupeesToPaise(d.payment.payment_amount ?? d.order.order_amount ?? 0), status } };
  }

  async fetchStatus(orderId: string): Promise<GatewayStatus> {
    const r = await this.call<{ cf_payment_id?: string | number; payment_status?: string; payment_amount?: number }[]>('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
    if (r.status === 404) return { status: 'pending' };
    if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`Cashfree status failed: ${r.status}`);
    const ok = r.body.find((p) => p.payment_status === 'SUCCESS');
    if (ok) return { status: 'paid', providerPaymentId: String(ok.cf_payment_id), amountPaise: rupeesToPaise(ok.payment_amount ?? 0) };
    if (r.body.length && r.body.every((p) => ['FAILED', 'USER_DROPPED', 'CANCELLED'].includes(String(p.payment_status)))) return { status: 'failed' };
    return { status: 'pending' };
  }

  async refund(o: RefundInput): Promise<{ refundId: string }> {
    if (!o.providerOrderId) throw new Error('Cashfree refunds need the order id');
    const refundId = o.refundRef.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const r = await this.call<{ cf_refund_id?: string | number; refund_id?: string; message?: string }>('POST', `/orders/${encodeURIComponent(o.providerOrderId)}/refunds`, { refund_amount: Number(paiseToRupees(o.amountPaise)), refund_id: refundId, refund_note: 'Fee refund' });
    if (r.status >= 300) throw new Error(`Cashfree refund failed: ${r.status} ${r.body.message ?? ''}`.trim());
    return { refundId: String(r.body.cf_refund_id ?? r.body.refund_id ?? refundId) };
  }

  async fetchSettlement(day: string): Promise<GatewaySettlement | null> {
    const r = await this.call<{ data?: { event_id?: string | number; event_type?: string; order_id?: string; event_amount?: number; service_charge?: number; service_tax?: number; event_settlement_amount?: number; settlement_utr?: string; cf_settlement_id?: string | number }[]; message?: string }>('POST', '/settlement/recon', {
      pagination: { limit: 200 },
      filters: { start_date: `${day}T00:00:00+05:30`, end_date: `${day}T23:59:59+05:30` },
    });
    if (r.status >= 300) throw new Error(`Cashfree settlement fetch failed: ${r.status} ${r.body.message ?? ''}`.trim());
    const rows = (r.body.data ?? []).filter((x) => x.event_type === 'PAYMENT' || x.event_type === 'REFUND');
    if (!rows.length) return null;
    return {
      reference: String(rows[0].settlement_utr ?? rows[0].cf_settlement_id ?? `cf-${day}`),
      settlementDate: day,
      lines: rows.map((x) => {
        const amount = rupeesToPaise(x.event_amount ?? 0);
        const fee = rupeesToPaise(x.service_charge ?? 0) + rupeesToPaise(x.service_tax ?? 0);
        const refund = x.event_type === 'REFUND';
        return { kind: refund ? ('refund' as const) : ('payment' as const), providerPaymentId: String(x.event_id ?? ''), providerOrderId: x.order_id ?? null, amountPaise: amount, feePaise: fee, netPaise: x.event_settlement_amount != null ? rupeesToPaise(x.event_settlement_amount) * (refund ? -1 : 1) : refund ? -amount : amount - fee };
      }),
    };
  }

  /** Fetching an order that does not exist answers 404 with good keys and 401 with bad ones. */
  async ping(): Promise<PingResult> {
    try {
      const r = await this.call<unknown>('GET', `/orders/zynetix-ping-${Date.now()}`);
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'AUTHENTICATION_FAILED', status: r.status };
      return r.status < 500 ? { ok: true } : { ok: false, error: 'GATEWAY_ERROR', status: r.status };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  }
}

// ----- Easebuzz ---------------------------------------------------------------------------------------

export const easebuzzHosts = (mode: GatewayMode, base?: string) =>
  base
    ? { pay: `${base}/easebuzz/pay`, dashboard: `${base}/easebuzz/dashboard` }
    : mode === 'live'
      ? { pay: 'https://pay.easebuzz.in', dashboard: 'https://dashboard.easebuzz.in' }
      : { pay: 'https://testpay.easebuzz.in', dashboard: 'https://testdashboard.easebuzz.in' };

const UDF = (f: Record<string, string>) => Array.from({ length: 10 }, (_, i) => f[`udf${i + 1}`] ?? '');

/** Easebuzz's request hash: key|txnid|amount|productinfo|firstname|email|udf1|…|udf10|salt. */
export const easebuzzRequestHash = (key: string, salt: string, f: Record<string, string>) => sha512([key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, ...UDF(f), salt].join('|'));

/** Easebuzz's response (reverse) hash: salt|status|udf10|…|udf1|email|firstname|productinfo|amount|txnid|key. */
export const easebuzzResponseHash = (key: string, salt: string, f: Record<string, string>) => sha512([salt, f.status ?? '', ...UDF(f).reverse(), f.email ?? '', f.firstname ?? '', f.productinfo ?? '', f.amount ?? '', f.txnid ?? '', key].join('|'));

/** One account at Easebuzz: merchant key and salt (the salt also checks responses and webhooks); `merchantEmail` for settlements. */
export class EasebuzzProvider extends PaymentProvider {
  readonly name = 'easebuzz';
  private readonly hosts: { pay: string; dashboard: string };

  constructor(
    readonly keyId: string,
    private readonly salt: string,
    mode: GatewayMode,
    private readonly merchantEmail: string | null,
    base?: string,
    private readonly http: Fetch = fetch,
  ) {
    super();
    this.hosts = easebuzzHosts(mode, base);
  }

  private async form<T>(url: string, fields: Record<string, string>): Promise<{ status: number; body: T }> {
    const res = await this.http(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(fields), signal: timeout(20_000) });
    return { status: res.status, body: (readJson<T>(await res.text()) ?? ({} as T)) as T };
  }

  async createOrder(o: OrderInput): Promise<Order> {
    const txnid = `kx${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const payer = o.payer ?? { name: 'Parent', email: '', phone: '' };
    const f: Record<string, string> = {
      key: this.keyId,
      txnid,
      amount: paiseToRupees(o.amountPaise),
      productinfo: o.receipt.slice(0, 100),
      firstname: firstNameOf(payer.name),
      email: payer.email || 'noreply@zynetix.invalid',
      phone: payer.phone.replace(/\D/g, '').slice(-10) || '9999999999',
      surl: o.returnUrl ?? '',
      furl: o.returnUrl ?? '',
      udf1: o.notes.tenantId ?? '',
      udf2: o.notes.invoiceId ?? '',
    };
    f.hash = easebuzzRequestHash(this.keyId, this.salt, f);
    const r = await this.form<{ status?: number; data?: string; error_desc?: string }>(`${this.hosts.pay}/payment/initiateLink`, f);
    if (r.status >= 300 || r.body.status !== 1 || !r.body.data) throw new Error(`Easebuzz order failed: ${r.status} ${r.body.error_desc ?? r.body.data ?? ''}`.trim());
    return { orderId: txnid, hosted: { url: `${this.hosts.pay}/pay/${encodeURIComponent(r.body.data)}`, method: 'GET', fields: {} } };
  }

  /** The return post: its `hash` (the reverse hash) proves it, and it must name this order and payment. */
  verifyPayment(orderId: string, paymentId: string, signature: string, fields?: Record<string, string>): boolean {
    if (!fields || fields.txnid !== orderId || fields.easepayid !== paymentId || fields.status !== 'success') return false;
    return safeEqual(easebuzzResponseHash(this.keyId, this.salt, fields), signature);
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    return !!signature && safeEqual(easebuzzResponseHash(this.keyId, this.salt, formFields(rawBody)), signature);
  }

  readWebhook(rawBody: Buffer): WebhookRead {
    const f = formFields(rawBody);
    if (!f.hash || !this.verifyWebhook(rawBody, f.hash)) return { ok: false };
    const status = f.status === 'success' ? 'paid' : ['failure', 'usercancelled', 'dropped', 'bounced'].includes(f.status ?? '') ? 'failed' : null;
    if (!f.txnid || !f.easepayid || !status) return { ok: true, event: null };
    return { ok: true, event: { key: `${f.status}:${f.easepayid}`, kind: 'payment', orderId: f.txnid, providerPaymentId: f.easepayid, amountPaise: rupeesToPaise(f.amount), status } };
  }

  /** Transaction API v2.1: hash = sha512(key|txnid|salt). */
  async fetchStatus(orderId: string): Promise<GatewayStatus> {
    const r = await this.form<{ status?: boolean; msg?: { status?: string; easepayid?: string; amount?: string }[] | { status?: string; easepayid?: string; amount?: string } | string }>(`${this.hosts.dashboard}/transaction/v2.1/retrieve`, { key: this.keyId, txnid: orderId, hash: sha512(`${this.keyId}|${orderId}|${this.salt}`) });
    if (r.status >= 300) throw new Error(`Easebuzz status failed: ${r.status}`);
    const list = Array.isArray(r.body.msg) ? r.body.msg : r.body.msg && typeof r.body.msg === 'object' ? [r.body.msg] : [];
    const ok = list.find((t) => t.status === 'success');
    if (ok) return { status: 'paid', providerPaymentId: ok.easepayid, amountPaise: ok.amount ? rupeesToPaise(ok.amount) : undefined };
    if (list.length && list.every((t) => ['failure', 'usercancelled', 'dropped', 'bounced'].includes(String(t.status)))) return { status: 'failed' };
    return { status: 'pending' };
  }

  /** Refund API v2: hash = sha512(key|merchant_refund_id|easebuzz_id|refund_amount|salt). */
  async refund(o: RefundInput): Promise<{ refundId: string }> {
    const refundAmount = paiseToRupees(o.amountPaise);
    const id = o.refundRef.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const r = await this.form<{ status?: boolean; refund_id?: string; reason?: string; message?: string }>(`${this.hosts.dashboard}/transaction/v2/refund`, {
      key: this.keyId,
      merchant_refund_id: id,
      easebuzz_id: o.providerPaymentId,
      refund_amount: refundAmount,
      hash: sha512(`${this.keyId}|${id}|${o.providerPaymentId}|${refundAmount}|${this.salt}`),
    });
    if (r.status >= 300 || r.body.status !== true) throw new Error(`Easebuzz refund failed: ${r.body.reason ?? r.body.message ?? r.status}`);
    return { refundId: String(r.body.refund_id ?? id) };
  }

  /** Settlements API: payouts of a date with their transactions; hash = sha512(key|merchant_email|payout_date|salt). */
  async fetchSettlement(day: string): Promise<GatewaySettlement | null> {
    const email = this.merchantEmail ?? '';
    const payoutDate = dmy(day);
    const r = await this.form<{ status?: boolean; data?: { payout_date?: string; bank_transaction_id?: string; payout_id?: string; peb_transactions?: Record<string, string>[]; refund_transactions?: Record<string, string>[] }[] }>(`${this.hosts.dashboard}/settlements/v1/retrieve`, {
      key: this.keyId,
      merchant_email: email,
      payout_date: payoutDate,
      hash: sha512(`${this.keyId}|${email}|${payoutDate}|${this.salt}`),
    });
    if (r.status >= 300) throw new Error(`Easebuzz settlement fetch failed: ${r.status}`);
    const payout = (r.body.data ?? [])[0];
    if (!payout) return null;
    const line = (t: Record<string, string>, refund: boolean) => {
      const amount = rupeesToPaise(t.refund_amount ?? t.amount ?? 0);
      const fee = rupeesToPaise(t.service_charge ?? 0) + rupeesToPaise(t.service_tax ?? 0);
      return { kind: refund ? ('refund' as const) : ('payment' as const), providerPaymentId: String(t.easebuzz_id ?? t.easepayid ?? ''), providerOrderId: t.txnid ?? null, amountPaise: amount, feePaise: fee, netPaise: refund ? -amount : t.settlement_amount ? rupeesToPaise(t.settlement_amount) : amount - fee };
    };
    const lines = [...(payout.peb_transactions ?? []).map((t) => line(t, false)), ...(payout.refund_transactions ?? []).map((t) => line(t, true))];
    return lines.length ? { reference: String(payout.bank_transaction_id ?? payout.payout_id ?? `ebz-${day}`), settlementDate: day, lines } : null;
  }

  /** A status call for an order that does not exist: Easebuzz answers "invalid hash/key" for bad credentials. */
  async ping(): Promise<PingResult> {
    try {
      const txnid = `zynetixping${Date.now()}`;
      const r = await this.form<{ status?: boolean; msg?: unknown; error?: string }>(`${this.hosts.dashboard}/transaction/v2.1/retrieve`, { key: this.keyId, txnid, hash: sha512(`${this.keyId}|${txnid}|${this.salt}`) });
      const msg = JSON.stringify(r.body.msg ?? r.body.error ?? '');
      if (r.status === 401 || /invalid (hash|key|merchant)|key is invalid|hash mismatch/i.test(msg)) return { ok: false, error: 'AUTHENTICATION_FAILED', status: r.status };
      return r.status < 500 ? { ok: true } : { ok: false, error: 'GATEWAY_ERROR', status: r.status };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  }
}

// ----- CCAvenue ---------------------------------------------------------------------------------------

export const ccavenueHosts = (mode: GatewayMode, base?: string) =>
  base
    ? { pay: `${base}/ccavenue/secure`, api: `${base}/ccavenue/api` }
    : mode === 'live'
      ? { pay: 'https://secure.ccavenue.com', api: 'https://api.ccavenue.com' }
      : { pay: 'https://test.ccavenue.com', api: 'https://apitest.ccavenue.com' };

const IV = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const ccKey = (workingKey: string) => createHash('md5').update(workingKey).digest();

/** CCAvenue's encryption: AES-128-CBC, key = MD5(working key), IV 0..15, hex. */
export const ccEncrypt = (workingKey: string, plain: string) => {
  const c = createCipheriv('aes-128-cbc', ccKey(workingKey), IV);
  return Buffer.concat([c.update(plain, 'utf8'), c.final()]).toString('hex');
};
export const ccDecrypt = (workingKey: string, hex: string) => {
  const d = createDecipheriv('aes-128-cbc', ccKey(workingKey), IV);
  return Buffer.concat([d.update(Buffer.from(hex, 'hex')), d.final()]).toString('utf8');
};
/** Decrypts or answers null (a body not encrypted with this working key). */
const ccTry = (workingKey: string, hex: string | undefined) => {
  if (!hex || !/^[0-9a-f]+$/i.test(hex) || hex.length % 32 !== 0) return null;
  try {
    return ccDecrypt(workingKey, hex);
  } catch {
    return null;
  }
};

/**
 * One account at CCAvenue: merchant id (key id), access code and working key. CCAvenue does not sign: a response
 * that decrypts with the working key and names the order is genuine (its padding fails otherwise).
 */
export class CcavenueProvider extends PaymentProvider {
  readonly name = 'ccavenue';
  private readonly hosts: { pay: string; api: string };

  constructor(
    readonly keyId: string,
    private readonly workingKey: string,
    private readonly accessCode: string,
    mode: GatewayMode,
    base?: string,
    private readonly http: Fetch = fetch,
  ) {
    super();
    this.hosts = ccavenueHosts(mode, base);
  }

  /** One API command: the JSON request encrypted, the answer "status=0&enc_response=…" decrypted. */
  private async api<T>(command: string, request: Record<string, unknown>): Promise<T> {
    const body = new URLSearchParams({ enc_request: ccEncrypt(this.workingKey, JSON.stringify(request)), access_code: this.accessCode, command, request_type: 'JSON', response_type: 'JSON', version: '1.2' });
    const res = await this.http(`${this.hosts.api}/apis/servlet/DoWebTrans`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: timeout(20_000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`CCAvenue ${command} failed: ${res.status}`);
    const f = formFields(text.trim());
    if (f.status !== '0') throw new Error(`CCAvenue ${command} failed: ${(f.enc_response ?? f.enc_error_code ?? 'unknown').slice(0, 120)}`);
    const plain = ccTry(this.workingKey, f.enc_response?.trim());
    if (plain === null) throw new Error(`CCAvenue ${command}: the answer did not decrypt with the working key`);
    return (readJson<T>(plain) ?? ({} as T)) as T;
  }

  async createOrder(o: OrderInput): Promise<Order> {
    const orderId = `KX${randomUUID().replace(/-/g, '').slice(0, 22).toUpperCase()}`;
    const payer = o.payer ?? { name: 'Parent', email: '', phone: '' };
    const data = new URLSearchParams({
      merchant_id: this.keyId,
      order_id: orderId,
      currency: 'INR',
      amount: paiseToRupees(o.amountPaise),
      redirect_url: o.returnUrl ?? '',
      cancel_url: o.returnUrl ?? '',
      language: 'EN',
      billing_name: payer.name.slice(0, 60),
      billing_email: payer.email,
      billing_tel: payer.phone.replace(/\D/g, '').slice(-10),
      merchant_param1: o.notes.tenantId ?? '',
      merchant_param2: o.notes.invoiceId ?? '',
      merchant_param3: o.receipt.slice(0, 100),
    }).toString();
    return { orderId, hosted: { url: `${this.hosts.pay}/transaction/transaction.do?command=initiateTransaction`, method: 'POST', fields: { encRequest: ccEncrypt(this.workingKey, data), access_code: this.accessCode } } };
  }

  /** The return post's encResp (passed as the signature): it must decrypt and name this order and tracking id with Success. */
  verifyPayment(orderId: string, paymentId: string, signature: string): boolean {
    const plain = ccTry(this.workingKey, signature);
    if (plain === null) return false;
    const f = formFields(plain);
    return f.order_id === orderId && f.tracking_id === paymentId && f.order_status === 'Success';
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    return ccTry(this.workingKey, signature || formFields(rawBody).encResp) !== null;
  }

  readWebhook(rawBody: Buffer): WebhookRead {
    const plain = ccTry(this.workingKey, formFields(rawBody).encResp);
    if (plain === null) return { ok: false };
    const f = formFields(plain);
    const status = f.order_status === 'Success' ? 'paid' : ['Failure', 'Aborted', 'Invalid'].includes(f.order_status ?? '') ? 'failed' : null;
    if (!f.order_id || !f.tracking_id || !status) return { ok: true, event: null };
    return { ok: true, event: { key: `${f.order_status}:${f.tracking_id}`, kind: 'payment', orderId: f.order_id, providerPaymentId: f.tracking_id, amountPaise: rupeesToPaise(f.amount ?? f.mer_amount), status } };
  }

  async fetchStatus(orderId: string): Promise<GatewayStatus> {
    const r = await this.api<{ order_status?: string; reference_no?: string | number; order_amt?: number | string; status?: number; error_desc?: string }>('orderStatusTracker', { order_no: orderId });
    if (r.status === 1 && /not\s*found|no record/i.test(r.error_desc ?? '')) return { status: 'pending' };
    if (['Shipped', 'Successful', 'Success'].includes(r.order_status ?? '')) return { status: 'paid', providerPaymentId: String(r.reference_no ?? ''), amountPaise: r.order_amt != null ? rupeesToPaise(r.order_amt) : undefined };
    if (['Aborted', 'Unsuccessful', 'Failure', 'Cancelled', 'Invalid', 'Timeout', 'Auto-Cancelled'].includes(r.order_status ?? '')) return { status: 'failed' };
    return { status: 'pending' };
  }

  async refund(o: RefundInput): Promise<{ refundId: string }> {
    const ref = o.refundRef.replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
    const r = await this.api<{ Refund_Order_Result?: { refund_status?: number; reason?: string } }>('refundOrder', { reference_no: o.providerPaymentId, refund_amount: paiseToRupees(o.amountPaise), refund_ref_no: ref });
    if (r.Refund_Order_Result?.refund_status !== 0) throw new Error(`CCAvenue refund failed: ${r.Refund_Order_Result?.reason ?? 'unknown'}`);
    return { refundId: ref };
  }

  /** payoutSummary for the day, then getSettlementDetails for each payout. */
  async fetchSettlement(day: string): Promise<GatewaySettlement | null> {
    const sum = await this.api<{ payout_summary_list?: { pay_id?: string | number; utr_no?: string; settlement_date?: string }[] }>('payoutSummary', { settlement_date: dmy(day) });
    const payouts = sum.payout_summary_list ?? [];
    if (!payouts.length) return null;
    const lines: GatewaySettlement['lines'] = [];
    for (const p of payouts) {
      const det = await this.api<{ settlement_details_list?: { order_no?: string; ccavenue_ref_no?: string | number; amount?: string | number; fees?: string | number; tax?: string | number; payable_amount?: string | number; txn_type?: string }[] }>('getSettlementDetails', { pay_id: p.pay_id });
      for (const t of det.settlement_details_list ?? []) {
        const refund = /refund/i.test(t.txn_type ?? '');
        const amount = Math.abs(rupeesToPaise(t.amount ?? 0));
        const fee = rupeesToPaise(t.fees ?? 0) + rupeesToPaise(t.tax ?? 0);
        lines.push({ kind: refund ? 'refund' : 'payment', providerPaymentId: String(t.ccavenue_ref_no ?? ''), providerOrderId: t.order_no ?? null, amountPaise: amount, feePaise: fee, netPaise: t.payable_amount != null ? rupeesToPaise(t.payable_amount) : refund ? -amount : amount - fee });
      }
    }
    return lines.length ? { reference: String(payouts[0].utr_no ?? payouts[0].pay_id ?? `cca-${day}`), settlementDate: day, lines } : null;
  }

  /** orderStatusTracker for a made-up order: good credentials answer "not found", bad ones fail. */
  async ping(): Promise<PingResult> {
    try {
      await this.api('orderStatusTracker', { order_no: `ZXPING${Date.now()}` });
      return { ok: true };
    } catch (e) {
      const m = noFail(e);
      if (/did not decrypt|access.?code|merchant|invalid/i.test(m)) return { ok: false, error: 'AUTHENTICATION_FAILED' };
      return /fetch failed|ECONN|timeout|network/i.test(m) ? { ok: false, error: 'NETWORK_ERROR' } : { ok: false, error: 'GATEWAY_ERROR' };
    }
  }
}
