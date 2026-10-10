'use client';

import { useState } from 'react';
import { addStep, closeFlag, refreshFlags } from '@/app/(dashboard)/early-alerts/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface AlertRow { id: string; studentName: string; rollNo: string; level: string; score: number; reasons: { signal: string; detail: string }[]; status: string }

const ACTIONS = ['call_parent', 'meet_student', 'extra_class', 'counselling_referral', 'remedial_plan', 'other'];

/** The flagged students; a step is logged against a flag and the flag is closed with what happened. */
export function EarlyAlertDesk({ rows, canRun }: { rows: AlertRow[]; canRun: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState<{ row: AlertRow; mode: 'step' | 'close' } | null>(null);
  const done = (m?: string) => {
    setOpen(null);
    toast(m || t('itg.done'));
  };
  const stepFields: Field[] = [
    { name: 'action', label: t('ea.f.action'), kind: 'select', init: 'call_parent', options: ACTIONS.map((a) => ({ value: a, label: t(`ea.act.${a}` as MessageKey) })) },
    { name: 'note', label: t('ea.f.note'), kind: 'multiline' },
    { name: 'dueOn', label: t('itg.col.status'), kind: 'date' },
  ];
  const closeFields: Field[] = [{ name: 'outcome', label: t('ea.f.outcome'), kind: 'multiline', required: true }];
  return (
    <>
      {canRun && (
        <Bar>
          <ActionButton label={t('ea.btn.run')} run={refreshFlags} onDone={done} />
        </Bar>
      )}
      <Grid
        rows={rows}
        empty={t('ea.empty')}
        tint={(r) => r.level === 'high'}
        cols={[
          { label: t('ea.col.student'), cell: (r) => `${r.studentName} (${r.rollNo})` },
          { label: t('ea.col.level'), cell: (r) => <Pill label={t(`ea.level.${r.level}` as MessageKey)} warn={r.level === 'high'} />, sort: (r) => r.score },
          { label: t('ea.col.reasons'), cell: (r) => r.reasons.map((x) => x.detail).join('; ') },
          { label: t('ea.col.status'), cell: (r) => t(`ea.status.${r.status}` as MessageKey) },
          {
            label: t('itg.col.action'),
            cell: (r) => (
              <>
                <button type="button" onClick={() => setOpen({ row: r, mode: 'step' })}>{t('ea.btn.step')}</button>{' '}
                <button type="button" onClick={() => setOpen({ row: r, mode: 'close' })}>{t('ea.btn.resolve')}</button>
              </>
            ),
          },
        ]}
      />
      {open && (
        <FormDialog
          title={open.row.studentName}
          fields={open.mode === 'step' ? stepFields : closeFields}
          onClose={() => setOpen(null)}
          onSubmit={async (v) => {
            const r = open.mode === 'step' ? await addStep(open.row.id, v) : await closeFlag(open.row.id, v);
            if (r.ok) done();
            return r;
          }}
        />
      )}
      {toastNode}
    </>
  );
}
