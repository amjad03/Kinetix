'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { confirmFee, respondToOffer, startFee, uploadDocument, type FeeCheckout } from '@/app/apply/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { PublicApplication } from '@/lib/admissions';
import { formatRupees } from '@/lib/money';

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
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {info && <Alert severity="info">{info}</Alert>}
      {app.feeStatus === 'pending' && !closed && (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t('apply.feeDue', { amount: formatRupees(app.feeDuePaise) })}
          </Typography>
          <Button variant="contained" sx={{ mt: 1 }} disabled={pending} onClick={pay}>
            {t('apply.payOnline')}
          </Button>
        </Box>
      )}
      {app.receiptNo && <Typography variant="body2">{t('apply.receipt', { no: app.receiptNo })}</Typography>}

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          {t('apply.documents')}
        </Typography>
        <Stack spacing={1.5}>
          {app.documents.map((d) => (
            <Box key={d.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {d.label}
                  {d.required ? ' *' : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {d.uploaded ? d.fileName : t('adm.review.notUploaded')}
                  {d.reviewNote ? ` · ${d.reviewNote}` : ''}
                </Typography>
              </Box>
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
            </Box>
          ))}
          {app.documents.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('adm.review.noDocuments')}
            </Typography>
          )}
        </Stack>
      </Box>

      {app.status === 'offered' && (
        <Alert severity="success" action={undefined}>
          <Typography sx={{ fontWeight: 600 }}>{t('apply.offerTitle')}</Typography>
          {app.offerExpiresOn && <Typography variant="body2">{t('apply.offerUntil', { date: app.offerExpiresOn })}</Typography>}
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button variant="contained" disabled={pending} onClick={() => start(async () => { const r = await respondToOffer(slug, app.id, token, 'accept'); if (r.ok) router.refresh(); else setError(r.error); })}>
              {t('apply.accept')}
            </Button>
            <Button disabled={pending} onClick={() => start(async () => { const r = await respondToOffer(slug, app.id, token, 'decline'); if (r.ok) router.refresh(); else setError(r.error); })}>
              {t('apply.decline')}
            </Button>
          </Stack>
        </Alert>
      )}
      {!closed && app.status !== 'offered' && app.status !== 'accepted' && (
        <Box>
          <Button size="small" color="error" disabled={pending} onClick={() => start(async () => { const r = await respondToOffer(slug, app.id, token, 'withdraw'); if (r.ok) router.refresh(); else setError(r.error); })}>
            {t('apply.withdraw')}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
