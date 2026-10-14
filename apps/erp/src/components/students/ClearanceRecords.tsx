'use client';

import { FileCheck2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { loadClearance } from '@/app/(dashboard)/students/info-actions';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, Sheet, StatusPill, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import type { Clearance } from '@/lib/student-info';
import { CLEARANCE_TONE, ClearancePanel } from './ClearancePanel';

type ClearanceRow = Row & { studentId: string; studentName: string; rollNo: string; className: string; purpose: string; status: string; total: number; cleared: number; pendingWith: string; duesPaise: number; createdAt: string };

/** No-dues clearances: who is waiting on which department, dues found, and a panel to sign lines off. */
export function ClearanceRecords({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState<Clearance | null>(null);
  const [, start] = useTransition();
  const c = (x: Row) => x as ClearanceRow;
  const view = (x: Row) =>
    start(async () => {
      const res = await loadClearance(x.id);
      if (!res.ok) return toast.error(res.error);
      setOpen(res.data);
    });
  const columns: Column<Row>[] = [
    {
      id: 'student',
      header: t('si.col.student'),
      sortKey: 'student',
      rowHeader: true,
      hideable: false,
      cell: (x) => (
        <span className="min-w-0">
          <b className="block truncate font-[550]">{c(x).studentName}</b>
          <small className="block truncate text-xs text-muted-foreground">
            {c(x).rollNo} · {c(x).className}
          </small>
        </span>
      ),
    },
    { id: 'purpose', header: t('si.clr.purpose'), hideBelow: 'sm', cell: (x) => t(`si.clr.purpose.${c(x).purpose}` as MessageKey) },
    {
      id: 'progress',
      header: t('si.col.progress'),
      cell: (x) => (
        <span className="grid gap-0.5">
          <span className="tabular-nums">{t('si.clr.progress', { done: c(x).cleared, total: c(x).total })}</span>
          {c(x).status === 'open' && c(x).pendingWith && (
            <small className="text-xs text-muted-foreground">
              {t('si.clr.waitingOn', {
                depts: c(x)
                  .pendingWith.split(', ')
                  .map((d) => t(`si.clr.dept.${d}` as MessageKey))
                  .join(', '),
              })}
            </small>
          )}
        </span>
      ),
    },
    { id: 'dues', header: t('si.col.dues'), align: 'right', hideBelow: 'md', cell: (x) => (c(x).duesPaise ? fmt.rupees(c(x).duesPaise) : '—') },
    { id: 'status', header: t('si.col.status'), sortKey: 'status', cell: (x) => <StatusPill tone={CLEARANCE_TONE[c(x).status]}>{t(`si.clr.status.${c(x).status}` as MessageKey)}</StatusPill> },
    { id: 'created', header: t('si.col.raisedOn'), sortKey: 'created', hideBelow: 'lg', cell: (x) => fmt.date(c(x).createdAt.slice(0, 10), 'short') },
  ];
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('si.tab.clearances')}
        columns={columns}
        onView={view}
        rowActionKeys={['recheck']}
        empty={
          <EmptyState icon={<FileCheck2 />} title={t('si.clr.none')} testId="no-clearances">
            {t('si.clr.noneBody')}
          </EmptyState>
        }
      />
      {open && (
        <Sheet open title={open.student.fullName} subtitle={`${open.student.rollNo} · ${open.student.className}`} onClose={() => setOpen(null)} width={560}>
          <div className="p-6">
            <ClearancePanel key={open.id} clearance={open} onChange={setOpen} />
          </div>
        </Sheet>
      )}
    </>
  );
}
