'use client';

import { useEffect, useState } from 'react';
import { deskRead } from '@/app/(dashboard)/accounts/actions';
import { Dialog } from '@/components/ui';
import { useI18n } from '@/i18n/client';

export interface UpiQr {
  intent: string;
  qrSvg: string;
  vpa: string;
  payee: string;
  amountPaise: number;
  reference: string;
  feeAccount: string | null;
}

/** The QR (made by the API from the NPCI UPI intent) bound to the amount, the UPI id and the reference. */
export function UpiQrView({ qr }: { qr: UpiQr }) {
  const { t, fmt } = useI18n();
  return (
    <div className="grid justify-items-center gap-3 text-center" data-testid="upi-qr">
      {/* The SVG is built by the API from the intent string alone (no user input reaches it). */}
      <div className="w-56 max-w-full rounded-lg border bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr.qrSvg }} />
      <p className="m-0 text-lg font-semibold tabular-nums">{fmt.rupees(qr.amountPaise)}</p>
      <p className="m-0 text-sm">
        {qr.payee}
        <br />
        <span className="font-mono text-[13px] text-muted-foreground">{qr.vpa}</span>
      </p>
      <p className="m-0 text-xs text-muted-foreground">{t('ff.upi.ref', { ref: qr.reference })}</p>
      <a className="text-sm underline underline-offset-2 sm:hidden" href={qr.intent}>
        {t('ff.upi.openApp')}
      </a>
    </div>
  );
}

/** A fee's UPI QR in a dialog (the office shows it at the counter or on a call). */
export function UpiQrDialog({ invoiceId, title, onClose }: { invoiceId: string; title: string; onClose: () => void }) {
  const { t } = useI18n();
  const [qr, setQr] = useState<UpiQr | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void deskRead<UpiQr | null>(`/v1/fees/invoices/${invoiceId}/upi`).then((r) => (r.ok ? setQr(r.data && 'intent' in r.data ? r.data : null) : setError(r.error)));
  }, [invoiceId]);
  return (
    <Dialog title={title} onClose={onClose}>
      {error ? <p className="m-0 text-sm text-destructive">{error}</p> : qr === undefined ? <p className="m-0 text-sm text-muted-foreground">{t('ff.loading')}</p> : qr === null ? <p className="m-0 text-sm text-muted-foreground">{t('ff.upi.none')}</p> : <UpiQrView qr={qr} />}
      <p className="m-0 mt-3 text-xs text-muted-foreground">{t('ff.upi.note')}</p>
    </Dialog>
  );
}
