'use client';

import { CheckCircle2, Clock3 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { payLinkCheckout, payLinkRefresh, type PayOrder } from '@/app/pay/actions';
import { Button } from '@/components/shadcn/button';
import { TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { UpiQrView, type UpiQr } from './UpiQrDialog';

export interface PayPage {
  status: 'active' | 'paid' | 'expired' | 'cancelled' | 'not_found';
  number?: string;
  institution?: string;
  studentFirstName?: string;
  title?: string;
  invoiceNo?: string | null;
  amountPaise?: number;
  balancePaise?: number;
  allowPartial?: boolean;
  expiresAt?: string;
  onlinePayments?: string | null;
  upi?: UpiQr | null;
}

const SDK: Record<string, string> = { razorpay: 'https://checkout.razorpay.com/v1/checkout.js', cashfree: 'https://sdk.cashfree.com/js/v3/cashfree.js' };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('The payment page could not be loaded'));
    document.head.appendChild(s);
  });
}

/** Posts or sends the browser to a hosted checkout page (PayU, CCAvenue, Easebuzz). */
function goHosted(h: NonNullable<PayOrder['hosted']>) {
  if (h.method === 'GET') return window.location.assign(h.url);
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = h.url;
  for (const [k, v] of Object.entries(h.fields)) {
    const i = document.createElement('input');
    i.type = 'hidden';
    i.name = k;
    i.value = v;
    form.appendChild(i);
  }
  document.body.appendChild(form);
  form.submit();
}

/**
 * The family's side of a payment link (no sign-in): the fee, the amount, the UPI QR bound to it, and a button that
 * opens the fee account's gateway. After the gateway's checkout the page asks the API whether the payment went through.
 */
export function PayLink({ slug, token, page }: { slug: string; token: string; page: PayPage }) {
  const { t, fmt } = useI18n();
  const [amount, setAmount] = useState(page.amountPaise ? String(page.amountPaise / 100) : '');
  const [state, setState] = useState<{ kind: 'idle' | 'waiting' | 'paid' | 'failed'; receiptNo?: string | null; error?: string }>({ kind: page.status === 'paid' ? 'paid' : 'idle' });
  const [pending, start] = useTransition();

  const check = async (paymentId: string, tries = 6) => {
    for (let i = 0; i < tries; i++) {
      const r = await payLinkRefresh(slug, token, paymentId);
      if (r.ok && r.data.status === 'paid') return setState({ kind: 'paid', receiptNo: r.data.receiptNo });
      if (r.ok && r.data.status === 'failed') return setState({ kind: 'failed', error: t('ff.pay.failed') });
      await new Promise((res) => setTimeout(res, 2500));
    }
    setState({ kind: 'waiting' });
  };

  const pay = () =>
    start(async () => {
      const want = page.allowPartial ? Math.round(Number(amount) * 100) : undefined;
      const r = await payLinkCheckout(slug, token, want);
      if (!r.ok) return setState({ kind: 'failed', error: r.error });
      const o = r.data;
      try {
        if (o.hosted) return goHosted(o.hosted);
        if (o.provider === 'cashfree' && o.session) {
          await loadScript(SDK.cashfree);
          const cf = (window as unknown as { Cashfree: (o: { mode: string }) => { checkout: (o: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown> } }).Cashfree({ mode: o.session.environment });
          await cf.checkout({ paymentSessionId: o.session.id, redirectTarget: '_modal' });
          return check(o.paymentId);
        }
        if (o.provider === 'razorpay') {
          await loadScript(SDK.razorpay);
          const Rzp = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } }).Razorpay;
          new Rzp({ key: o.keyId, order_id: o.orderId, amount: o.amountPaise, currency: 'INR', name: o.name, description: o.description, prefill: o.prefill, handler: () => void check(o.paymentId), modal: { ondismiss: () => void check(o.paymentId, 1) } }).open();
          return;
        }
        setState({ kind: 'failed', error: t('ff.pay.demo') });
      } catch (e) {
        setState({ kind: 'failed', error: (e as Error).message });
      }
    });

  if (page.status === 'not_found') return <p className="m-0 text-sm">{t('ff.pay.notFound')}</p>;
  if (state.kind === 'paid' || page.status === 'paid')
    return (
      <div className="grid justify-items-center gap-2 text-center" data-testid="pay-done">
        <CheckCircle2 className="size-10 text-emerald-600" />
        <p className="m-0 text-lg font-semibold">{t('ff.pay.thanks')}</p>
        {state.receiptNo ? <p className="m-0 text-sm">{t('ff.pay.receipt', { no: state.receiptNo })}</p> : <p className="m-0 text-sm text-muted-foreground">{t('ff.pay.alreadyPaid')}</p>}
      </div>
    );
  if (page.status !== 'active') return <p className="m-0 text-sm">{t(page.status === 'expired' ? 'ff.pay.expired' : 'ff.pay.cancelled')}</p>;
  return (
    <div className="grid gap-5" data-testid="pay-link">
      <div className="grid gap-1">
        <p className="m-0 text-sm text-muted-foreground">{page.institution}</p>
        <h1 className="m-0 text-xl font-semibold">{page.title}</h1>
        <p className="m-0 text-sm">{t('ff.pay.for', { name: page.studentFirstName ?? '' })}</p>
        <p className="m-0 text-3xl font-semibold tabular-nums">{fmt.rupees(page.amountPaise ?? 0)}</p>
        {page.expiresAt ? <p className="m-0 text-xs text-muted-foreground">{t('ff.pay.until', { when: fmt.date(page.expiresAt.slice(0, 10)) })}</p> : null}
      </div>
      {page.allowPartial ? <TextInput label={t('ff.pay.amount')} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /> : null}
      {page.onlinePayments ? (
        <Button size="lg" disabled={pending} onClick={pay} data-testid="pay-online">
          {t('ff.pay.online')}
        </Button>
      ) : null}
      {state.kind === 'waiting' ? (
        <p className="m-0 flex items-center gap-2 text-sm">
          <Clock3 className="size-4" /> {t('ff.pay.waiting')}
        </p>
      ) : null}
      {state.kind === 'failed' ? <p className="m-0 text-sm text-destructive">{state.error}</p> : null}
      {page.upi ? (
        <div className="grid gap-2 border-t pt-4">
          <p className="m-0 text-sm font-medium">{t('ff.pay.orUpi')}</p>
          <UpiQrView qr={page.upi} />
        </div>
      ) : null}
    </div>
  );
}
