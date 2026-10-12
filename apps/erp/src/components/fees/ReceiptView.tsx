'use client';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import { formatDateTime } from '@/lib/dates';
import { formatRupees, methodLabel, rupeesInWords } from '@/lib/money';
import type { FeeReceipt } from '@/lib/types';

import { Divider, Typography } from '@/components/kx';
import { cn } from '@/lib/utils';
function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr] sm:grid-cols-[180px_1fr] gap-0 sm:gap-4 py-1.5">
      <p className="text-[13px] leading-[19px] text-muted-foreground">
        {label}
      </p>
      <Typography className={cn('tabular-nums wrap-break-word', strong ? 'font-medium' : 'font-normal')} variant={strong ? 'subtitle1' : 'body2'}>
        {children}
      </Typography>
    </div>
  );
}

/** A fee receipt: on screen after a counter payment, and on the printable page. */
export function ReceiptView({ r, timeZone, full }: { r: FeeReceipt; timeZone: string; full?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <div data-testid="receipt">
      {full && (
        <div className="text-center mb-6">
          <p className="text-[1.375rem] leading-7 font-medium">
            {r.institution}
          </p>
          <h1 className="font-medium tracking-[0.2em] text-[0.875rem] text-muted-foreground">
            {t('fees.receipt.title')}
          </h1>
        </div>
      )}
      <div className="flex justify-between flex-wrap gap-2 mb-2">
        <h6 className="text-base leading-6 tracking-[0.1px] font-medium" data-testid="receipt-no">
          {r.receiptNo}
        </h6>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {locale === 'en'
            ? new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.paidAt))
            : `${formatDateTime(r.paidAt, timeZone, true, locale)} · ${new Intl.DateTimeFormat('en-IN', { timeZone, year: 'numeric' }).format(new Date(r.paidAt))}`}
        </p>
      </div>
      <Divider className="mb-2" />
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
      <Divider className="my-2" />
      <Row label={t('fees.receipt.fee')}>{formatRupees(r.invoice.amountPaise)}</Row>
      <Row label={t('fees.receipt.balance')}>{r.invoice.balancePaise > 0 ? formatRupees(r.invoice.balancePaise) : t('fees.receipt.nil')}</Row>
    </div>
  );
}
