'use client';

import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import { formatDateTime } from '@/lib/dates';
import { formatRupees, methodLabel, rupeesInWords } from '@/lib/money';
import type { FeeReceipt } from '@/lib/types';

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, gap: { xs: 0, sm: 2 }, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant={strong ? 'subtitle1' : 'body2'} sx={{ fontWeight: strong ? 500 : 400, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Box>
  );
}

/** A fee receipt: on screen after a counter payment, and on the printable page. */
export function ReceiptView({ r, timeZone, full }: { r: FeeReceipt; timeZone: string; full?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <Box data-testid="receipt">
      {full && (
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h5" component="p" sx={{ fontWeight: 500 }}>
            {r.institution}
          </Typography>
          <Typography variant="overline" component="h1" sx={{ letterSpacing: '0.2em', fontSize: '0.875rem', color: 'text.secondary' }}>
            {t('fees.receipt.title')}
          </Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }} data-testid="receipt-no">
          {r.receiptNo}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {locale === 'en'
            ? new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.paidAt))
            : `${formatDateTime(r.paidAt, timeZone, true, locale)} · ${new Intl.DateTimeFormat('en-IN', { timeZone, year: 'numeric' }).format(new Date(r.paidAt))}`}
        </Typography>
      </Box>
      <Divider sx={{ mb: 1 }} />
      <Row label={t('fees.receipt.student')}>
        {r.student.fullName}
        {r.student.rollNo ? ` · ${r.student.rollNo}` : ''}
      </Row>
      <Row label={t('fees.receipt.class')}>{r.className}</Row>
      <Row label={t('fees.receipt.towards')}>{r.invoice.title}</Row>
      <Row label={t('fees.receipt.amount')} strong>
        <span data-testid="receipt-amount">{formatRupees(r.amountPaise)}</span>
      </Row>
      {full && <Row label={t('fees.receipt.words')}>{rupeesInWords(r.amountPaise)}</Row>}
      <Row label={t('fees.receipt.paidBy')}>
        {methodLabel(r.method, t)}
        {r.reference ? ` · ${r.reference}` : ''}
      </Row>
      <Divider sx={{ my: 1 }} />
      <Row label={t('fees.receipt.fee')}>{formatRupees(r.invoice.amountPaise)}</Row>
      <Row label={t('fees.receipt.balance')}>{r.invoice.balancePaise > 0 ? formatRupees(r.invoice.balancePaise) : t('fees.receipt.nil')}</Row>
    </Box>
  );
}
