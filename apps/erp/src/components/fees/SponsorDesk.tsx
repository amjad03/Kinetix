'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { addSponsor, cancelSponsorInvoice, issueSponsorInvoice, recordSponsorPayment } from '@/app/(dashboard)/fees/sponsors/actions';
import { ActionButton, FormDialog, Grid, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { SPONSOR_LINE_SLOTS, SPONSOR_PAY_METHODS, type SponsorInvoiceRow, type SponsorOutstanding, type SponsorRow } from '@/lib/payments-desk';

/** Sponsor invoices, the outstanding report and the sponsor list. */
export function SponsorDesk({ sponsors, invoices, outstanding, students }: { sponsors: SponsorRow[]; invoices: SponsorInvoiceRow[]; outstanding: SponsorOutstanding; students: { id: string; label: string }[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dialog, setDialog] = useState<'sponsor' | 'invoice' | SponsorInvoiceRow | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const statusLabel = (i: SponsorInvoiceRow) => (i.overdue ? t('pd.status.overdue') : t(`pd.status.${i.status}` as MessageKey));
  const invoiceCols: Col<SponsorInvoiceRow>[] = [
    { label: t('pd.col.invoiceNo'), cell: (i) => i.invoiceNo, sort: (i) => i.invoiceNo },
    { label: t('pd.col.sponsor'), cell: (i) => i.sponsorName, sort: (i) => i.sponsorName },
    { label: t('pd.col.po'), cell: (i) => i.poNumber ?? '-', sort: (i) => i.poNumber },
    { label: t('pd.col.fee'), cell: (i) => i.title, sort: (i) => i.title },
    { label: t('pd.col.due'), cell: (i) => fmt.date(i.dueOn), sort: (i) => i.dueOn },
    { label: t('pd.col.billed'), cell: (i) => fmt.rupees(i.amountPaise), num: true, sort: (i) => i.amountPaise },
    { label: t('pd.col.received'), cell: (i) => fmt.rupees(i.paidPaise), num: true, sort: (i) => i.paidPaise },
    { label: t('pd.col.outstanding'), cell: (i) => fmt.rupees(i.balancePaise), num: true, sort: (i) => i.balancePaise },
    { label: t('pd.col.status'), cell: (i) => <Pill label={statusLabel(i)} warn={i.overdue || i.status === 'cancelled'} /> },
    {
      label: '',
      cell: (i) =>
        i.status === 'open' || i.status === 'partial' ? (
          <Stack direction="row" spacing={0.5}>
            <Button size="small" onClick={() => setDialog(i)} data-testid={`pd-pay-${i.id}`}>{t('pd.recordPayment')}</Button>
            {i.paidPaise === 0 && <ActionButton label={t('pd.cancelInvoice')} tone="error" run={() => cancelSponsorInvoice(i.id)} onDone={toast} />}
          </Stack>
        ) : null,
    },
  ];

  const outCols: Col<SponsorOutstanding['sponsors'][number]>[] = [
    { label: t('pd.col.sponsor'), cell: (s) => s.sponsorName, sort: (s) => s.sponsorName },
    { label: t('pd.col.openInvoices'), cell: (s) => fmt.number(s.invoices), num: true, sort: (s) => s.invoices },
    { label: t('pd.col.billed'), cell: (s) => fmt.rupees(s.billedPaise), num: true, sort: (s) => s.billedPaise },
    { label: t('pd.col.received'), cell: (s) => fmt.rupees(s.paidPaise), num: true, sort: (s) => s.paidPaise },
    { label: t('pd.col.outstanding'), cell: (s) => fmt.rupees(s.outstandingPaise), num: true, sort: (s) => s.outstandingPaise },
    { label: t('pd.col.overdue'), cell: (s) => fmt.rupees(s.overduePaise), num: true, sort: (s) => s.overduePaise },
  ];

  const sponsorCols: Col<SponsorRow>[] = [
    { label: t('pd.col.sponsor'), cell: (s) => s.name, sort: (s) => s.name },
    { label: t('pd.col.contact'), cell: (s) => s.contactName ?? '-' },
    { label: t('pd.col.email'), cell: (s) => s.contactEmail ?? '-' },
    { label: t('pd.col.gstin'), cell: (s) => s.gstin ?? '-' },
  ];

  const studentOptions = [{ value: '', label: t('pd.f.noStudent') }, ...students.map((s) => ({ value: s.id, label: s.label }))];
  const invoiceFields: Field[] = [
    { name: 'sponsorId', label: t('pd.col.sponsor'), kind: 'select', required: true, options: [{ value: '', label: t('pd.f.chooseSponsor') }, ...sponsors.map((s) => ({ value: s.id, label: s.name }))] },
    { name: 'poNumber', label: t('pd.f.po') },
    { name: 'title', label: t('pd.f.title'), required: true },
    { name: 'description', label: t('pd.f.description') },
    { name: 'dueOn', label: t('pd.col.due'), kind: 'date', required: true, init: today },
    ...Array.from({ length: SPONSOR_LINE_SLOTS }, (_, i) => [
      { name: `s${i + 1}`, label: t('pd.f.studentN', { n: i + 1 }), kind: 'select' as const, options: studentOptions, required: i === 0 },
      { name: `a${i + 1}`, label: t('pd.f.amountN', { n: i + 1 }), kind: 'rupees' as const, required: i === 0 },
    ]).flat(),
  ];

  const close = (m?: string) => {
    setDialog(null);
    if (m) toast(m);
  };

  const tabs = [
    {
      id: 'invoices',
      label: t('pd.tab.invoices'),
      node: (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDialog('invoice')} disabled={sponsors.length === 0} data-testid="pd-new-invoice">{t('pd.newInvoice')}</Button>
            <Button onClick={() => setDialog('sponsor')} data-testid="pd-new-sponsor">{t('pd.newSponsor')}</Button>
          </Stack>
          <Grid testId="pd-invoices" empty={t('pd.empty.invoices')} rows={invoices} cols={invoiceCols} exportName="sponsor-invoices" />
        </>
      ),
    },
    {
      id: 'outstanding',
      label: t('pd.tab.outstanding'),
      node: (
        <>
          <Stack direction="row" spacing={3} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }} data-testid="pd-totals">
            <span>{t('pd.total.billed', { amount: fmt.rupees(outstanding.billedPaise) })}</span>
            <span>{t('pd.total.received', { amount: fmt.rupees(outstanding.paidPaise) })}</span>
            <strong>{t('pd.total.outstanding', { amount: fmt.rupees(outstanding.outstandingPaise) })}</strong>
            <span>{t('pd.total.overdue', { amount: fmt.rupees(outstanding.overduePaise) })}</span>
          </Stack>
          <Grid testId="pd-outstanding" empty={t('pd.empty.outstanding')} rows={outstanding.sponsors} cols={outCols} exportName="sponsor-outstanding" />
        </>
      ),
    },
    { id: 'sponsors', label: t('pd.tab.sponsors'), node: <Grid testId="pd-sponsors" empty={t('pd.empty.sponsors')} rows={sponsors} cols={sponsorCols} /> },
  ];

  return (
    <>
      <Tabbed label={t('pd.sponsors.title')} initial="invoices" tabs={tabs} />
      {dialog === 'sponsor' && (
        <FormDialog
          title={t('pd.newSponsor')}
          fields={[
            { name: 'name', label: t('pd.f.sponsorName'), required: true },
            { name: 'contactName', label: t('pd.col.contact') },
            { name: 'contactEmail', label: t('pd.col.email') },
            { name: 'gstin', label: t('pd.col.gstin') },
          ]}
          onSubmit={addSponsor}
          onClose={close}
        />
      )}
      {dialog === 'invoice' && <FormDialog title={t('pd.newInvoice')} intro={t('pd.invoiceIntro')} fields={invoiceFields} onSubmit={issueSponsorInvoice} onClose={close} />}
      {dialog && typeof dialog === 'object' && (
        <FormDialog
          title={t('pd.payTitle', { no: dialog.invoiceNo })}
          intro={t('pd.payIntro', { amount: fmt.rupees(dialog.balancePaise) })}
          fields={[
            { name: 'amount', label: t('pd.col.amount'), kind: 'rupees', required: true, init: String(dialog.balancePaise / 100) },
            { name: 'method', label: t('pd.f.method'), kind: 'select', required: true, init: 'bank_transfer', options: SPONSOR_PAY_METHODS.map((m) => ({ value: m, label: t(`pd.method.${m}` as MessageKey) })) },
            { name: 'reference', label: t('pd.f.reference') },
            { name: 'receivedOn', label: t('pd.f.receivedOn'), kind: 'date', required: true, init: today },
          ]}
          onSubmit={(v) => recordSponsorPayment(dialog.id, v)}
          onClose={close}
        />
      )}
      {toastNode}
    </>
  );
}
