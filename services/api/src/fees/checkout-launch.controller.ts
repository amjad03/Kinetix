import { Controller, Get, Ip, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { RateLimiter } from '../common/rate-limiter.js';
import { DbService } from '../db/db.service.js';
import { feePayments } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { GatewayFlow } from './gateway-flow.service.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** A value for an inline script, safe inside <script> (no closing tag, no line separators). */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const page = (title: string, body: string, script = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#1f2937}main{max-width:28rem;padding:2rem;text-align:center}button{font:inherit;padding:.75rem 1.5rem;border-radius:.5rem;border:0;background:#1d4ed8;color:#fff}</style></head><body><main>${body}</main>${script}</body></html>`;

/**
 * The checkout of one online payment opened in a browser: the apps open this page for gateways without an in-app SDK
 * (PayU, CCAvenue and Easebuzz hosted pages, Cashfree's and Razorpay's web checkouts), and the ERP's payment-link
 * page can too. The short-lived token in the URL (made when the order was) is the only key; the page shows nothing
 * but the institution, the fee and the amount, and sends the browser on to the gateway.
 */
@Controller('v1/public/checkout')
export class CheckoutLaunchController {
  constructor(
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly flow: GatewayFlow,
    private readonly limiter: RateLimiter,
  ) {}

  @Get(':slug/:paymentId')
  async launch(@Param('slug') slug: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Query('t') token: string | undefined, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    await this.limiter.hit(`checkout-launch:${ip}`, 30, 60_000);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const tenant = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant || !token || !this.flow.launchTokenOk(tenant.id, paymentId, token)) return page('Payment', '<h1>This payment link has expired</h1><p>Go back to the app and start the payment again.</p>');
    const [pay] = await this.db.withTenant(tenant.id, (tx) => tx.select().from(feePayments).where(eq(feePayments.id, paymentId)));
    if (!pay || pay.method !== 'online') return page('Payment', '<h1>Payment not found</h1>');
    if (pay.status === 'paid') return page('Paid', `<h1>Already paid</h1><p>Receipt ${esc(pay.receiptNo ?? '')}. You can close this window.</p>`);
    if (pay.status !== 'created') return page('Payment', '<h1>This payment was not completed</h1><p>Go back to the app and start it again.</p>');
    const c = (pay.checkout ?? {}) as { hosted?: { url: string; method: 'POST' | 'GET'; fields: Record<string, string> } | null; session?: { id: string; environment: string } | null; keyId?: string; name?: string; description?: string; prefill?: Record<string, string> };
    const rupees = `₹${((pay.amountPaise + pay.conveniencePaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const head = `<h1>${esc(c.name ?? '')}</h1><p>${esc(c.description ?? '')}</p><p style="font-size:1.75rem;font-weight:600">${rupees}</p>`;
    if (c.hosted) {
      if (c.hosted.method === 'GET') return page('Pay', `${head}<p><a href="${esc(c.hosted.url)}">Continue to pay</a></p>`, `<script>location.replace(${js(c.hosted.url)})</script>`);
      const inputs = Object.entries(c.hosted.fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
      return page('Pay', `${head}<form id="go" method="POST" action="${esc(c.hosted.url)}">${inputs}<button type="submit">Continue to pay</button></form>`, `<script>document.getElementById('go').submit()</script>`);
    }
    if (pay.provider === 'cashfree' && c.session) {
      return page('Pay', `${head}<button id="go">Pay now</button>`, `<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script><script>function go(){Cashfree({mode:${js(c.session.environment)}}).checkout({paymentSessionId:${js(c.session.id)},redirectTarget:'_self'})}document.getElementById('go').onclick=go;go()</script>`);
    }
    if (pay.provider === 'razorpay') {
      const base = this.flow.publicBase ?? `${res.req.protocol}://${res.req.headers.host}`;
      const opts = { key: c.keyId, order_id: pay.providerOrderId, amount: pay.amountPaise + pay.conveniencePaise, currency: 'INR', name: c.name, description: c.description, prefill: c.prefill, callback_url: `${base}/v1/fees/gateway-return/razorpay/${slug}`, redirect: true };
      return page('Pay', `${head}<button id="go">Pay now</button>`, `<script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>function go(){new Razorpay(${js(opts)}).open()}document.getElementById('go').onclick=go;go()</script>`);
    }
    return page('Demo', `${head}<p>This is a demo: no money moves. Pay in the app's demo sheet instead.</p>`);
  }
}
