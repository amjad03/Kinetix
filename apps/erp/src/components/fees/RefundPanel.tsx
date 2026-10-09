'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { refundPayment } from '@/app/(dashboard)/fees/refund-actions';
import { sendRefund } from '@/app/(dashboard)/workflows/bound-actions';
import { FormDialog, useToast, type Field } from '@/components/ops/kit';
import { SendForApproval } from '@/components/pathways-b/SendForApproval';
import { useI18n } from '@/i18n/client';
import { BOUND_FLOWS } from '@/lib/pathways-b';

/** Refund this payment now, or send the refund for approval. Hidden when printing. */
export function RefundPanel({ paymentId, amountPaise, flows }: { paymentId: string; amountPaise: number; flows: Record<string, boolean> | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [toast, toastNode] = useToast();
  const fields: Field[] = [
    { name: 'amount', label: t('pwb.refund.amount'), kind: 'rupees', required: true, init: String(amountPaise / 100) },
    { name: 'reason', label: t('pwb.refund.reason'), required: true },
  ];
  return (
    <Stack direction="row" spacing={1} className="kx-noprint" sx={{ alignItems: 'center', flexWrap: 'wrap' }} data-testid="pwb-refund-panel">
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} data-testid="pwb-refund">{t('pwb.refund.now')}</Button>
      <SendForApproval flow={BOUND_FLOWS[1]} flows={flows} fields={fields} onSend={(v) => sendRefund(paymentId, v)} />
      {open && (
        <FormDialog
          title={t('pwb.refund.now')}
          submitLabel={t('pwb.refund.now')}
          fields={fields}
          onSubmit={(v) => refundPayment(paymentId, v)}
          onClose={(done) => {
            setOpen(false);
            if (done) toast(t('pwb.refund.done'));
          }}
        />
      )}
      {toastNode}
    </Stack>
  );
}
