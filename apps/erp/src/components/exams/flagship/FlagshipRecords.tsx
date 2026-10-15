'use client';

import { FileQuestion, LockOpen } from 'lucide-react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { EmptyState, StatusPill, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type Props = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; extraParams?: Record<string, string> };

const TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral', appointed: 'warning', accepted: 'info', declined: 'danger', submitted: 'info', completed: 'success' };
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? '' : String(r[k]));

function Status({ entity, value }: { entity: string; value: unknown }) {
  const { t } = useI18n();
  const v = String(value ?? '');
  return <StatusPill tone={TONE[v] ?? 'neutral'}>{tr(t, `rk.o.${entity}.status.${v}`, v)}</StatusPill>;
}

/** Requests to unlock submitted or locked marks: the head of department or controller approves or turns them down. */
export function UnlockRequestRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const e = 'marks-unlock-requests';
  const columns: Column<Row>[] = [
    { id: 'assessment', header: t('xf.un.col.assessment'), rowHeader: true, hideable: false, cell: (r) => `${s(r, 'code')} ${s(r, 'assessment')}` },
    { id: 'section', header: t('xf.app.col.class'), hideBelow: 'sm', cell: (r) => s(r, 'section') },
    { id: 'requestedBy', header: t('xf.un.col.by'), hideBelow: 'md', cell: (r) => s(r, 'requestedBy') },
    { id: 'reason', header: t('xf.app.reason'), hideBelow: 'md', cell: (r) => <span className="block min-w-[180px] max-w-[360px] whitespace-normal">{s(r, 'reason')}</span> },
    { id: 'created', header: t('xf.un.col.asked'), sortKey: 'created', hideBelow: 'sm', cell: (r) => fmt.date(s(r, 'createdAt').slice(0, 10), 'short') },
    { id: 'decidedBy', header: t('xf.un.col.decided'), defaultHidden: true, cell: (r) => [s(r, 'decidedBy'), s(r, 'decisionNote')].filter(Boolean).join(': ') || '-' },
    { id: 'status', header: t('exm.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('rk.entity.marks-unlock-requests')}
      columns={columns}
      empty={
        <EmptyState icon={<LockOpen />} title={t('xf.un.empty')} testId="no-unlock-requests">
          {t('xf.un.emptyBody')}
        </EmptyState>
      }
    />
  );
}

/** Every setter and moderator appointed for every session, with due dates, progress and fees. */
export function AppointmentRecords({ meta, page, state, extraParams }: Props) {
  const { t, fmt } = useI18n();
  const e = 'qp-appointments';
  const columns: Column<Row>[] = [
    { id: 'subject', header: t('xf.reg.col.paper'), sortKey: 'subject', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'code')} ${s(r, 'subjectName')}` },
    { id: 'role', header: t('xf.qp.col.role'), cell: (r) => tr(t, `rk.o.${e}.role.${s(r, 'role')}`, s(r, 'role')) },
    { id: 'staff', header: t('xf.qp.col.name'), sortKey: 'staff', cell: (r) => s(r, 'staffName') },
    { id: 'session', header: t('xc.col.session'), hideBelow: 'lg', defaultHidden: true, cell: (r) => s(r, 'sessionName') },
    { id: 'due', header: t('xf.qp.col.due'), sortKey: 'due', hideBelow: 'sm', cell: (r) => fmt.date(s(r, 'dueOn').slice(0, 10), 'short') },
    { id: 'fee', header: t('xf.qp.col.fee'), align: 'right', hideBelow: 'md', cell: (r) => fmt.rupees(Number(r.remunerationPaise ?? 0)) },
    { id: 'status', header: t('exm.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('rk.entity.qp-appointments')}
      columns={columns}
      extraParams={extraParams}
      empty={
        <EmptyState icon={<FileQuestion />} title={t('xf.qp.noAppointments')} testId="no-qp-appointments">
          {t('xf.qp.appointHint')}
        </EmptyState>
      }
    />
  );
}
