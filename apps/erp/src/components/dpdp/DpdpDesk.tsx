'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { processRequest } from '@/app/(dashboard)/dpdp/actions';
import { FormDialog, Grid, useToast } from '@/components/ops/kit';
import { StatGrid, StatTile, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { waitingDays, type DpdpRow } from '@/lib/dpdp';

const TONE = { pending: 'warning', completed: 'success', rejected: 'neutral', blocked: 'danger' } as const;

/** The data-privacy queue: who asked for what, with approve and reject on the open ones. */
export function DpdpDesk({ rows, officer, nowIso }: { rows: DpdpRow[]; officer: { name: string; email: string | null; phone: string | null } | null; nowIso: string }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [pick, setPick] = useState<{ row: DpdpRow; decision: 'approve' | 'reject' } | null>(null);
  const now = new Date(nowIso);
  const count = (s: DpdpRow['status']) => rows.filter((r) => r.status === s).length;
  const detail = (r: DpdpRow) => (r.correction ? t('dp.correction', { field: r.correction.field, value: r.correction.value }) : r.details || '—');

  return (
    <>
      <StatGrid min={130}>
        <StatTile label={t('dp.stat.pending')} value={count('pending')} tone={count('pending') ? 'warning' : 'default'} testId="dp-pending" />
        <StatTile label={t('dp.stat.blocked')} value={count('blocked')} testId="dp-blocked" />
        <StatTile label={t('dp.stat.done')} value={count('completed')} testId="dp-done" />
      </StatGrid>
      <Alert severity="info" sx={{ my: 2 }} data-testid="dp-officer">
        {officer ? `${t('dp.officer')}: ${officer.name}${officer.email ? ` · ${officer.email}` : ''}${officer.phone ? ` · ${officer.phone}` : ''}` : t('dp.officer.none')}
      </Alert>
      <Grid
        testId="dp-queue"
        empty={t('dp.empty')}
        rows={rows}
        cols={[
          { label: t('dp.col.person'), cell: (r) => r.person?.fullName ?? '—', sort: (r) => r.person?.fullName ?? '' },
          { label: t('dp.col.kind'), cell: (r) => t(`dp.kind.${r.kind}` as MessageKey), sort: (r) => r.kind },
          {
            label: t('dp.col.details'),
            cell: (r) => (
              <Stack spacing={0.5}>
                <Typography variant="body2">{detail(r)}</Typography>
                {r.retentionReasons.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {t('dp.reasons')}: {r.retentionReasons.join(' ')}
                  </Typography>
                )}
              </Stack>
            ),
          },
          { label: t('dp.col.status'), cell: (r) => <StatusPill tone={TONE[r.status]}>{t(`dp.st.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status },
          { label: t('dp.col.asked'), cell: (r) => r.createdAt.slice(0, 10), sort: (r) => r.createdAt },
          { label: t('dp.col.wait'), cell: (r) => (r.status === 'pending' ? waitingDays(r.createdAt, now) : '—'), num: true },
          {
            label: '',
            cell: (r) =>
              r.status === 'pending' && r.kind !== 'export' ? (
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setPick({ row: r, decision: 'approve' })}>
                    {t('dp.approve')}
                  </Button>
                  <Button size="small" color="error" onClick={() => setPick({ row: r, decision: 'reject' })}>
                    {t('dp.reject')}
                  </Button>
                </Stack>
              ) : null,
          },
        ]}
      />
      {pick && (
        <FormDialog
          title={t(pick.decision === 'approve' ? 'dp.approveTitle' : 'dp.rejectTitle')}
          intro={pick.decision === 'approve' ? <Typography variant="body2">{t('dp.approveHint')}</Typography> : undefined}
          fields={[{ name: 'note', label: t('dp.note'), kind: 'multiline', required: pick.decision === 'reject' }]}
          onSubmit={(v) => processRequest(pick.row.id, pick.decision, v.note ?? '')}
          onClose={(m) => {
            setPick(null);
            if (m) toast(t('dp.done'));
          }}
        />
      )}
      {toastNode}
    </>
  );
}
