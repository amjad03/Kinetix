'use client';

import { UserX } from 'lucide-react';
import { useMemo } from 'react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { EmptyState, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { weekdayName } from '@/lib/dates';

/** When teachers cannot be timetabled (Timetable → Setup → Unavailability), on the record kit. */
export function UnavailabilityRecords({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt, locale } = useI18n();
  type R = Row & Record<string, string | number | null>;
  const columns = useMemo<Column<Row>[]>(() => {
    const v = (x: Row) => x as R;
    return [
      { id: 'teacher', header: t('tts2.u.teacher'), sortKey: 'teacher', rowHeader: true, hideable: false, cell: (x) => v(x).teacher },
      { id: 'day', header: t('tts2.day'), sortKey: 'day', cell: (x) => weekdayName(Number(v(x).dayOfWeek), locale) },
      { id: 'time', header: t('tts2.u.time'), sortKey: 'starts', cell: (x) => (v(x).startsAt ? `${v(x).startsAt}–${v(x).endsAt}` : t('tts2.u.allDay')) },
      { id: 'range', header: t('tts2.u.range'), hideBelow: 'md', cell: (x) => (v(x).fromDate || v(x).toDate ? `${v(x).fromDate ? fmt.date(String(v(x).fromDate), 'short') : '…'} – ${v(x).toDate ? fmt.date(String(v(x).toDate), 'short') : '…'}` : t('tts2.u.always')) },
      { id: 'reason', header: t('tts2.u.reason'), cell: (x) => <span className="block min-w-[160px] max-w-[320px] whitespace-normal">{v(x).reason}</span> },
    ];
  }, [t, fmt, locale]);
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={tr(t, 'rk.entity.faculty-unavailability', 'Teacher unavailability')}
      columns={columns}
      extraParams={{ tab: 'unavailability' }}
      empty={<EmptyState icon={<UserX />} title={t('tts2.u.emptyTitle')} description={t('tts2.u.emptyBody')} />}
      emptyActions
    />
  );
}
