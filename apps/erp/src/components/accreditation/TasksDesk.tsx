'use client';

import { Trash2 } from 'lucide-react';
import NextLink from 'next/link';
import { useState, useTransition } from 'react';
import { assignTask, removeTask, updateTask } from '@/app/(dashboard)/accreditation/actions';
import { Button } from '@/components/kx';
import { Card, DataTable, FormRow, FormRowActions, SelectInput, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { People, TaskRow } from '@/lib/accreditation-ui';

const TONE = { assigned: 'neutral', in_progress: 'info', submitted: 'warning', approved: 'success', returned: 'danger' } as const;

/**
 * Assignment of criteria and metrics to departments and staff with due dates and reviewers; the review status of each
 * task, with approve, return and remove for the quality team.
 */
export function TasksDesk({ fw, cycle, tasks, people, scopes, canManage }: { fw: string; cycle: string; tasks: TaskRow[]; people: People | null; scopes: { value: string; label: string }[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const blank = { scope: '', departmentId: '', ownerId: '', reviewerId: '', dueOn: '' };
  const [v, setV] = useState(blank);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const staff = (people?.staff ?? []).map((s) => ({ value: s.id, label: s.department ? `${s.name} (${s.department})` : s.name }));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(done);
        after?.();
      } else toast.error(res.error ?? '');
    });
  const columns: Column<TaskRow>[] = [
    { id: 'scope', header: t('acx.t.scope'), rowHeader: true, sort: (r) => r.scope, cell: (r) => (/^[\dA-Z]+$/.test(r.scope) && !r.scope.includes('.') ? <b>{r.title}</b> : <NextLink href={`/accreditation/${fw}/metrics/${encodeURIComponent(r.scope)}?cycle=${cycle}`} className="font-semibold">{`${r.scope} ${r.title}`}</NextLink>) },
    { id: 'owner', header: t('acx.t.owner'), sort: (r) => r.ownerName ?? r.departmentName ?? '', cell: (r) => <span>{[r.ownerName, r.departmentName].filter(Boolean).join(' · ') || '-'}</span> },
    { id: 'reviewer', header: t('acx.t.reviewer'), hideBelow: 'md', sort: (r) => r.reviewerName ?? '', cell: (r) => r.reviewerName ?? '-' },
    { id: 'due', header: t('acx.t.due'), sort: (r) => r.dueOn ?? '9999', cell: (r) => (r.dueOn ? <span className={r.overdue ? 'font-semibold text-red-ink' : ''}>{fmt.date(r.dueOn)}</span> : '-') },
    { id: 'status', header: t('acx.t.status'), sort: (r) => r.status, cell: (r) => <StatusPill tone={r.overdue ? 'danger' : TONE[r.status]}>{r.overdue ? t('acx.t.overdue') : t(`acx.ts.${r.status}` as MessageKey)}</StatusPill> },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: t('acx.t.actions'),
            csv: false as const,
            cell: (r: TaskRow) => (
              <span className="flex flex-wrap gap-1.5">
                {r.status === 'submitted' && (
                  <>
                    <Button size="small" variant="contained" disabled={pending} onClick={() => run(() => updateTask(fw, r.id, { status: 'approved' }), t('acx.t.approved'))}>
                      {t('acx.t.approve')}
                    </Button>
                    <Button size="small" variant="outlined" disabled={pending} onClick={() => run(() => updateTask(fw, r.id, { status: 'returned' }), t('acx.t.returnedDone'))}>
                      {t('acx.t.return')}
                    </Button>
                  </>
                )}
                <Button size="small" variant="text" color="error" aria-label={t('acx.t.remove')} startIcon={<Trash2 />} disabled={pending} onClick={() => run(() => removeTask(fw, r.id), t('acx.t.removed'))}>
                  {t('acx.t.remove')}
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="acx-tasks">
      {canManage && people && (
        <Card title={t('acx.t.assign')} subtitle={t('acx.t.assignSub')}>
          <FormRow
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => assignTask(fw, cycle, v), t('acx.t.assigned'), () => setV(blank));
            }}
          >
            <SelectInput className="min-w-[260px] flex-[2]" label={t('acx.t.scope')} required value={v.scope} onChange={set('scope')} options={scopes} empty="" />
            <SelectInput className="min-w-[180px] flex-1" label={t('acx.t.department')} value={v.departmentId} onChange={set('departmentId')} options={people.departments.map((d) => ({ value: d.id, label: d.name }))} empty={t('acx.t.none')} />
            <SelectInput className="min-w-[200px] flex-1" label={t('acx.t.owner')} value={v.ownerId} onChange={set('ownerId')} options={staff} empty={t('acx.t.none')} />
            <SelectInput className="min-w-[200px] flex-1" label={t('acx.t.reviewer')} value={v.reviewerId} onChange={set('reviewerId')} options={staff} empty={t('acx.t.none')} />
            <TextInput className="w-[170px]" type="date" label={t('acx.t.due')} value={v.dueOn} onChange={set('dueOn')} />
            <FormRowActions>
              <Button type="submit" variant="contained" disabled={pending || !v.scope || (!v.ownerId && !v.departmentId)} data-testid="acx-assign">
                {t('acx.t.assignBtn')}
              </Button>
            </FormRowActions>
          </FormRow>
        </Card>
      )}
      <DataTable<TaskRow> columns={columns} rows={tasks} rowId={(r) => r.id} label={t('acx.t.title')} exportName={`accreditation-tasks-${fw}-${cycle}`} rowTone={(r) => (r.overdue ? 'danger' : undefined)} empty={t('acx.t.empty')} initialSort={{ id: 'due', dir: 'asc' }} />
    </div>
  );
}
