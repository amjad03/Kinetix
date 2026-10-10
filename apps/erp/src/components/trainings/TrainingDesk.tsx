'use client';

import Button from '@mui/material/Button';
import { useState } from 'react';
import { decideTraining } from '@/app/(dashboard)/trainings/actions';
import { Tiles } from '@/components/campus/Desk';
import { FormDialog, Grid, useToast } from '@/components/ops/kit';
import { StatTile } from '@/components/StatTile';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { nextTrainingSteps, type TrainingRequestRow, type TrainingStatus } from '@/lib/trainings';

const TONE = { requested: 'warning', confirmed: 'success', done: 'neutral', cancelled: 'neutral' } as const;
const STEP_LABEL = { confirmed: 'trn.confirm', done: 'trn.done', cancelled: 'trn.cancel', requested: 'trn.st.requested' } as const;

/** Training requests from the board: the slot, topic and status, and a dialog to answer one. */
export function TrainingDesk({ rows }: { rows: TrainingRequestRow[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [answering, setAnswering] = useState<TrainingRequestRow | null>(null);
  const when = (iso: string) => fmt.dateTime(iso);

  return (
    <>
      <Tiles>
        <StatTile label={t('trn.stat.open')} value={fmt.number(rows.filter((r) => r.status === 'requested').length)} testId="tr-open" />
        <StatTile label={t('trn.stat.confirmed')} value={fmt.number(rows.filter((r) => r.status === 'confirmed').length)} />
      </Tiles>
      <Grid
        testId="tr-list"
        empty={t('trn.empty')}
        rows={rows}
        cols={[
          { label: t('trn.col.teacher'), cell: (r) => r.requester ?? '—', sort: (r) => r.requester ?? '' },
          { label: t('trn.col.topic'), cell: (r) => r.topic, sort: (r) => r.topic },
          { label: t('trn.col.slot'), cell: (r) => when(r.slotAt), sort: (r) => r.slotAt },
          { label: t('trn.col.status'), cell: (r) => <StatusPill tone={TONE[r.status]}>{t(`trn.st.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status },
          { label: t('trn.col.note'), cell: (r) => r.adminNote || '—' },
          {
            label: '',
            cell: (r) =>
              nextTrainingSteps(r.status).length > 0 ? (
                <Button size="small" onClick={() => setAnswering(r)} data-testid={`tr-answer-${r.id}`}>
                  {t('trn.confirm')} / {t('trn.cancel')}
                </Button>
              ) : null,
          },
        ]}
      />
      {answering && (
        <FormDialog
          title={answering.topic}
          onSubmit={(v) => decideTraining(answering.id, v.status as Exclude<TrainingStatus, 'requested'>, v.adminNote ?? '')}
          onClose={(m) => {
            setAnswering(null);
            if (m) toast(t('trn.updated'));
          }}
          fields={[
            { name: 'status', label: t('trn.col.status'), kind: 'select', required: true, init: nextTrainingSteps(answering.status)[0], options: nextTrainingSteps(answering.status).map((s) => ({ value: s, label: t(STEP_LABEL[s] as MessageKey) })) },
            { name: 'adminNote', label: t('trn.f.note'), init: answering.adminNote },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
