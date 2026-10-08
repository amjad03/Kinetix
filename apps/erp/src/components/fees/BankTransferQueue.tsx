'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { rejectTransfer, verifyTransfer } from '@/app/(dashboard)/fees/bank-transfers/actions';
import { ActionButton, FormDialog, Grid, Pill, Tabbed, useToast, type Col } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { proofPath, type BankTransferRow, type TransferStatus } from '@/lib/payments-desk';

const TABS: TransferStatus[] = ['pending', 'verified', 'rejected'];

/** The verification queue: pending transfers first, then the ones already decided. */
export function BankTransferQueue({ rows }: { rows: BankTransferRow[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [rejecting, setRejecting] = useState<BankTransferRow | null>(null);

  const cols = (status: TransferStatus): Col<BankTransferRow>[] => [
    { label: t('pd.col.student'), cell: (r) => `${r.student.fullName}${r.student.rollNo ? ` (${r.student.rollNo})` : ''}`, sort: (r) => r.student.fullName },
    { label: t('pd.col.class'), cell: (r) => r.className, sort: (r) => r.className },
    { label: t('pd.col.fee'), cell: (r) => r.invoiceTitle, sort: (r) => r.invoiceTitle },
    { label: t('pd.col.utr'), cell: (r) => r.utr, sort: (r) => r.utr },
    { label: t('pd.col.transferDate'), cell: (r) => fmt.date(r.transferDate), sort: (r) => r.transferDate },
    { label: t('pd.col.amount'), cell: (r) => fmt.rupees(r.amountPaise), num: true, sort: (r) => r.amountPaise },
    { label: t('pd.col.balance'), cell: (r) => fmt.rupees(r.balancePaise), num: true, sort: (r) => r.balancePaise },
    {
      label: t('pd.col.proof'),
      cell: (r) => (r.hasProof ? <Button size="small" href={proofPath(r.id)} target="_blank" rel="noopener">{t('pd.viewProof')}</Button> : '-'),
    },
    status === 'pending'
      ? {
          label: '',
          cell: (r) => (
            <Stack direction="row" spacing={0.5}>
              <ActionButton label={t('pd.verify')} run={() => verifyTransfer(r.id)} onDone={toast} />
              <Button size="small" color="error" onClick={() => setRejecting(r)} data-testid={`pd-reject-${r.id}`}>{t('pd.reject')}</Button>
            </Stack>
          ),
        }
      : { label: t('pd.col.status'), cell: (r) => <Pill label={r.status === 'rejected' && r.reviewNote ? `${t(`pd.status.${r.status}` as MessageKey)}: ${r.reviewNote}` : t(`pd.status.${r.status}` as MessageKey)} warn={r.status === 'rejected'} /> },
  ];

  return (
    <>
      <Tabbed
        label={t('pd.transfers.title')}
        initial="pending"
        tabs={TABS.map((s) => {
          const list = rows.filter((r) => r.status === s);
          return { id: s, label: `${t(`pd.status.${s}` as MessageKey)} (${list.length})`, node: <Grid testId={`pd-transfers-${s}`} empty={t('pd.transfers.empty')} rows={list} cols={cols(s)} /> };
        })}
      />
      {rejecting && (
        <FormDialog
          title={t('pd.rejectTitle', { utr: rejecting.utr })}
          intro={t('pd.rejectIntro')}
          fields={[{ name: 'note', label: t('pd.f.reason'), kind: 'multiline', required: true }]}
          submitLabel={t('pd.reject')}
          onSubmit={(v) => rejectTransfer(rejecting.id, v)}
          onClose={(m) => {
            setRejecting(null);
            if (m) toast(m);
          }}
        />
      )}
      {toastNode}
    </>
  );
}
