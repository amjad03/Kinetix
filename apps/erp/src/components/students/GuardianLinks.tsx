'use client';

import { UserRound, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type LinkRow = Row & { guardianName: string; phone: string | null; email: string | null; relation: string; isPrimary: boolean; isEmergencyContact: boolean; studentId: string; studentName: string; rollNo: string; className: string; children: number; userId: string };

/**
 * Guardians as a record kit list: one row per guardian and student, with brothers and sisters (a parent of more
 * than one student), primary and emergency contacts, bulk edit, import of families, export and history.
 */
export function GuardianLinks({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t } = useI18n();
  const router = useRouter();
  const g = (x: Row) => x as LinkRow;
  const columns: Column<Row>[] = [
    {
      id: 'guardian',
      header: t('si.col.guardian'),
      sortKey: 'guardian',
      rowHeader: true,
      hideable: false,
      cell: (x) => (
        <span className="min-w-0">
          <b className="block truncate font-[550]">{g(x).guardianName}</b>
          <small className="block truncate text-xs text-muted-foreground">{[g(x).phone, g(x).email].filter(Boolean).join(' · ')}</small>
        </span>
      ),
    },
    { id: 'relation', header: t('si.col.relation'), sortKey: 'relation', cell: (x) => t(`si.o.relation.${g(x).relation}` as MessageKey) },
    {
      id: 'student',
      header: t('si.col.student'),
      sortKey: 'student',
      cell: (x) => (
        <span className="min-w-0">
          <span className="block truncate">{g(x).studentName}</span>
          <small className="block truncate text-xs text-muted-foreground">
            {g(x).rollNo} · {g(x).className}
          </small>
        </span>
      ),
    },
    {
      id: 'contact',
      header: t('si.col.contact'),
      hideBelow: 'md',
      cell: (x) => (
        <span className="flex flex-wrap gap-1">
          {g(x).isPrimary && <StatusPill tone="info">{t('si.primary')}</StatusPill>}
          {g(x).isEmergencyContact && <StatusPill tone="warning">{t('si.emergency')}</StatusPill>}
        </span>
      ),
    },
    { id: 'children', header: t('si.col.children'), sortKey: 'children', align: 'right', hideBelow: 'sm', cell: (x) => g(x).children },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('si.tab.guardians')}
      columns={columns}
      rowHref={(x) => `/students/${g(x).studentId}`}
      extraRowActions={(x) => [{ id: 'guardian', label: t('si.openGuardian'), icon: <UserRound />, onSelect: () => router.push(`/academics/guardians/${g(x).userId}`) }]}
      empty={
        <EmptyState icon={<UsersRound />} title={t('si.guardians.none')} testId="no-guardians">
          {t('si.guardians.noneBody')}
        </EmptyState>
      }
    />
  );
}
