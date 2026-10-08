'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { createTask, setTaskStatus } from '@/app/(dashboard)/tasks/actions';
import { ActionButton, FormDialog, Grid, Pill, Tabbed, useToast, type Col } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { dueState, nextStatuses, type TaskRow } from '@/lib/work';

/** "My tasks" and "Assigned by me", with a new-task dialog and status buttons. */
export function TaskDesk({ mine, assigned, people }: { mine: TaskRow[]; assigned: TaskRow[]; people: { id: string; fullName: string }[] }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const [toast, toastNode] = useToast();
  const now = Date.now();

  const cols = (who: 'ownerName' | 'assigneeName'): Col<TaskRow>[] => [
    { label: t('wk.tk.col.title'), cell: (x) => x.title },
    { label: t(who === 'ownerName' ? 'wk.tk.col.from' : 'wk.tk.col.to'), cell: (x) => x[who] },
    { label: t('wk.tk.col.priority'), cell: (x) => <Pill label={t(`wk.tk.pri.${x.priority}` as MessageKey)} warn={x.priority === 'urgent'} /> },
    { label: t('wk.tk.col.due'), cell: (x) => (x.dueAt ? <Pill label={fmt.dateTime(x.dueAt)} warn={dueState(x, now) === 'overdue'} /> : '-'), sort: (x) => x.dueAt },
    { label: t('wk.tk.col.status'), cell: (x) => t(`wk.tk.status.${x.status}` as MessageKey) },
    { label: t('wk.tk.col.source'), cell: (x) => x.sourceModule ?? '-' },
    {
      label: '',
      cell: (x) => (
        <>
          {nextStatuses(x.status).map((s) => (
            <ActionButton key={s} label={t(`wk.tk.to.${s}` as MessageKey)} run={() => setTaskStatus(x.id, s, x.version)} onDone={toast} tone={s === 'cancelled' ? 'error' : undefined} />
          ))}
        </>
      ),
    },
  ];

  return (
    <>
      <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)} sx={{ my: 3 }}>
        {t('wk.tk.new')}
      </Button>
      <Tabbed
        label={t('nav.tasks')}
        initial="mine"
        tabs={[
          { id: 'mine', label: t('wk.tk.tab.mine'), node: <Grid testId="tasks-mine" empty={t('wk.tk.emptyMine')} rows={mine} cols={cols('ownerName')} tint={(x) => x.overdue} /> },
          { id: 'assigned', label: t('wk.tk.tab.assigned'), node: <Grid testId="tasks-assigned" empty={t('wk.tk.emptyAssigned')} rows={assigned} cols={cols('assigneeName')} tint={(x) => x.overdue} /> },
        ]}
      />
      {open && (
        <FormDialog
          title={t('wk.tk.new')}
          onSubmit={createTask}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(m);
          }}
          fields={[
            { name: 'title', label: t('wk.tk.col.title'), required: true },
            { name: 'description', label: t('wk.tk.description'), kind: 'multiline' },
            { name: 'assigneeId', label: t('wk.tk.col.to'), kind: 'select', required: true, options: people.map((p) => ({ value: p.id, label: p.fullName })) },
            { name: 'priority', label: t('wk.tk.col.priority'), kind: 'select', init: 'normal', options: (['low', 'normal', 'high', 'urgent'] as const).map((p) => ({ value: p, label: t(`wk.tk.pri.${p}` as MessageKey) })) },
            { name: 'dueAt', label: t('wk.tk.col.due'), kind: 'datetime' },
            { name: 'slaHours', label: t('wk.tk.sla'), kind: 'number' },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
