'use client';

import Button from '@mui/material/Button';
import { useState } from 'react';
import { fetchSettlement, importSettlement, resolveLine, saveGateway } from '@/app/(dashboard)/settlements/actions';
import { ActionButton, Bar, FormDialog, Grid, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface GatewayView { gateway: 'razorpay' | 'payu' | null; configured: boolean; keyId: string | null; mode: string | null; webhookPath: string; payuWebhookPath: string }
export interface Batch { id: string; provider: string; reference: string; settlementDate: string; grossPaise: number; feePaise: number; netPaise: number; lineCount: number; exceptionCount: number }
export interface Exception { line: { id: string; providerPaymentId: string; amountPaise: number; exceptionReason: string; kind: string }; reference: string; provider: string }

/** Choose the gateway, import or fetch a settlement, and clear the exceptions queue. */
export function SettlementsDesk({ gateway, batches, exceptions, initialTab }: { gateway: GatewayView; batches: Batch[]; exceptions: Exception[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dialog, setDialog] = useState<'gateway' | 'import' | 'fetch' | null>(null);
  const done = (m?: string) => {
    setDialog(null);
    if (m) toast(m);
  };
  const providers = [{ value: 'razorpay', label: 'Razorpay' }, { value: 'payu', label: 'PayU' }];
  const gatewayFields: Field[] = [
    { name: 'provider', label: t('gb.set.choose'), kind: 'select', required: true, init: gateway.gateway ?? 'payu', options: providers },
    { name: 'keyId', label: t('gb.set.keyId'), required: true, init: gateway.keyId ?? '' },
    { name: 'keySecret', label: t('gb.set.secret') },
    { name: 'webhookSecret', label: t('gb.set.webhookSecret') },
  ];
  const importFields: Field[] = [
    { name: 'provider', label: t('gb.col.provider'), kind: 'select', required: true, init: gateway.gateway ?? 'payu', options: providers },
    { name: 'reference', label: t('gb.col.reference'), required: true },
    { name: 'settlementDate', label: t('gb.set.settlementDate'), kind: 'date', required: true },
    { name: 'csv', label: t('gb.set.csv'), kind: 'multiline', required: true },
  ];
  const tabs = [
    {
      id: 'batches',
      label: t('gb.set.batches'),
      node: (
        <>
          <Bar>
            <Button variant="contained" onClick={() => setDialog('import')}>{t('gb.set.import')}</Button>
            <Button variant="outlined" onClick={() => setDialog('fetch')}>{t('gb.set.fetch')}</Button>
          </Bar>
          <Grid
            testId="settlement-batches"
            empty={t('gb.empty')}
            rows={batches}
            cols={[
              { label: t('gb.col.date'), cell: (b) => b.settlementDate, sort: (b) => b.settlementDate },
              { label: t('gb.col.provider'), cell: (b) => b.provider },
              { label: t('gb.col.reference'), cell: (b) => b.reference },
              { label: t('gb.col.lines'), num: true, cell: (b) => b.lineCount },
              { label: t('gb.set.fees'), num: true, cell: (b) => fmt.rupees(b.feePaise) },
              { label: t('gb.set.net'), num: true, cell: (b) => fmt.rupees(b.netPaise) },
              { label: t('gb.set.exceptions'), num: true, cell: (b) => b.exceptionCount },
            ]}
          />
        </>
      ),
    },
    {
      id: 'exceptions',
      label: `${t('gb.set.exceptions')} (${exceptions.length})`,
      node: (
        <Grid
          testId="settlement-exceptions"
          empty={t('gb.set.noExceptions')}
          rows={exceptions}
          cols={[
            { label: t('gb.col.reference'), cell: (e) => `${e.reference} / ${e.line.providerPaymentId}` },
            { label: t('gb.col.amount'), num: true, cell: (e) => fmt.rupees(e.line.amountPaise) },
            { label: t('gb.col.reason'), cell: (e) => t(`gb.set.reason.${e.line.exceptionReason}` as MessageKey) },
            { label: '', cell: (e) => <ActionButton label={t('gb.set.accept')} run={() => resolveLine(e.line.id, e.line.exceptionReason)} onDone={toast} /> },
          ]}
        />
      ),
    },
    {
      id: 'gateway',
      label: t('gb.set.gateway'),
      node: (
        <>
          <p>{t('gb.set.gatewayHelp')}</p>
          <p data-testid="gateway-current">
            {t('gb.set.current')}: {gateway.gateway ?? t('gb.set.none')}
            {gateway.keyId ? ` (${gateway.keyId})` : ''}
          </p>
          {gateway.configured && (
            <p>
              {t('gb.set.webhook')}: <code>{gateway.gateway === 'payu' ? gateway.payuWebhookPath : gateway.webhookPath}</code>
            </p>
          )}
          <Button variant="contained" onClick={() => setDialog('gateway')}>{t('gb.set.choose')}</Button>
        </>
      ),
    },
  ];
  return (
    <>
      <Tabbed tabs={tabs} initial={initialTab} label={t('nav.settlements')} />
      {dialog === 'gateway' && <FormDialog title={t('gb.set.gateway')} fields={gatewayFields} onSubmit={saveGateway} onClose={done} />}
      {dialog === 'import' && <FormDialog title={t('gb.set.import')} intro={t('gb.set.importHelp')} fields={importFields} onSubmit={importSettlement} onClose={done} />}
      {dialog === 'fetch' && <FormDialog title={t('gb.set.fetch')} fields={[{ name: 'day', label: t('gb.set.settlementDate'), kind: 'date', required: true }]} onSubmit={fetchSettlement} onClose={done} />}
      {toastNode}
    </>
  );
}
