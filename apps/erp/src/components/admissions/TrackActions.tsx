'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { confirmFee, respondToOffer, startFee, uploadDocument, type FeeCheckout } from '@/app/apply/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { PublicApplication } from '@/lib/admissions';
import { formatRupees } from '@/lib/money';

import { Alert, Button, Chip } from '@/components/kx';
interface RazorpayWindow {
  Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, f: () => void): void };
}

function loadCheckout(): Promise<boolean> {
  const w = window as unknown as RazorpayWindow;
  if (w.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** What the applicant can still do: upload documents, pay the fee, answer an offer, withdraw. */
export function TrackActions({ slug, app, token }: { slug: string; app: PublicApplication; token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const files = useRef<Record<string, HTMLInputElement | null>>({});
  const closed = ['rejected', 'withdrawn', 'declined', 'enrolled'].includes(app.status);

  const pay = () =>
    start(async () => {
      setError(null);
      const res = await startFee(slug, app.id, token);
      if (!res.ok) return setError(res.error);
      const co: FeeCheckout = res.data;
      if (co.provider !== 'razorpay') return setInfo(t('apply.payAtCounter'));
      if (!(await loadCheckout())) return setError(t('apply.checkoutBlocked'));
      const Razorpay = (window as unknown as RazorpayWindow).Razorpay!;
      const rz = new Razorpay({
        key: co.keyId,
        order_id: co.orderId,
        amount: co.amountPaise,
        currency: co.currency,
        name: co.name,
        description: co.description,
        prefill: co.prefill,
        handler: (r: { razorpay_payment_id: string; razorpay_signature: string }) => {
          start(async () => {
            const done = await confirmFee(slug, app.id, token, { paymentId: co.paymentId, providerPaymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
            if (done.ok) router.refresh();
            else setError(done.error);
          });
        },
      });
      rz.open();
    });

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      {info && <Alert severity="info">{info}</Alert>}
      {app.feeStatus === 'pending' && !closed && (
        <div>
          <h6 className="text-base leading-6 tracking-[0.1px] font-semibold">
            {t('apply.feeDue', { amount: formatRupees(app.feeDuePaise) })}
          </h6>
          <Button className="mt-2" variant="contained" disabled={pending} onClick={pay}>
            {t('apply.payOnline')}
          </Button>
        </div>
      )}
      {app.receiptNo && <p className="text-[13px] leading-[19px]">{t('apply.receipt', { no: app.receiptNo })}</p>}

      <div>
        <h6 className="text-base leading-6 tracking-[0.1px] font-semibold mb-2">
          {t('apply.documents')}
        </h6>
        <div className="flex flex-col gap-3">
          {app.documents.map((d) => (
            <div className="flex items-center gap-2 flex-wrap" key={d.key}>
              <div className="flex-[1_1_200px] min-w-0">
                <p className="text-[13px] leading-[19px] font-semibold">
                  {d.label}
                  {d.required ? ' *' : ''}
                </p>
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {d.uploaded ? d.fileName : t('adm.review.notUploaded')}
                  {d.reviewNote ? ` · ${d.reviewNote}` : ''}
                </span>
              </div>
              {d.status && <Chip size="small" color={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'error' : 'default'} label={t(`adm.doc.${d.status}` as MessageKey)} />}
              {!closed && (
                <>
                  <input
                    ref={(el) => {
                      files.current[d.key] = el;
                    }}
                    type="file"
                    hidden
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) return setError(t('apply.fileTooBig'));
                      start(async () => {
                        setError(null);
                        const fd = new FormData();
                        fd.set('file', file);
                        const res = await uploadDocument(slug, app.id, token, d.key, fd);
                        if (res.ok) router.refresh();
                        else setError(res.error);
                      });
                    }}
                  />
                  <Button size="small" variant="outlined" disabled={pending} onClick={() => files.current[d.key]?.click()}>
                    {d.uploaded ? t('apply.replace') : t('apply.upload')}
                  </Button>
                </>
              )}
            </div>
          ))}
          {app.documents.length === 0 && (
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('adm.review.noDocuments')}
            </p>
          )}
        </div>
      </div>

      {app.status === 'offered' && (
        <Alert severity="success" action={undefined}>
          <p className="text-sm leading-[21px] font-semibold">{t('apply.offerTitle')}</p>
          {app.offerExpiresOn && <p className="text-[13px] leading-[19px]">{t('apply.offerUntil', { date: app.offerExpiresOn })}</p>}
          <div className="flex flex-row gap-2 mt-3">
            <Button variant="contained" disabled={pending} onClick={() => start(async () => { const r = await respondToOffer(slug, app.id, token, 'accept'); if (r.ok) router.refresh(); else setError(r.error); })}>
              {t('apply.accept')}
            </Button>
            <Button disabled={pending} onClick={() => start(async () => { const r = await respondToOffer(slug, app.id, token, 'decline'); if (r.ok) router.refresh(); else setError(r.error); })}>
              {t('apply.decline')}
            </Button>
          </div>
        </Alert>
      )}
      {!closed && app.status !== 'offered' && app.status !== 'accepted' && (
        <div>
          <Button size="small" color="error" disabled={pending} onClick={() => start(async () => { const r = await respondToOffer(slug, app.id, token, 'withdraw'); if (r.ok) router.refresh(); else setError(r.error); })}>
            {t('apply.withdraw')}
          </Button>
        </div>
      )}
    </div>
  );
}
