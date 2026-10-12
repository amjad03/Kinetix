'use client';
import { useI18n } from '@/i18n/client';
import { daysBetween } from '@/lib/dates';
import type { HomeworkRow } from '@/lib/types';
import { DataTable, StatusPill, type Column } from '@/components/ui';

/** Recent homework as a searchable, sortable table with CSV export. */
export function HomeworkTable({ rows, today, timezone }: { rows: HomeworkRow[]; today: string; timezone: string }) {
  const { t, fmt } = useI18n();

  const due = (h: HomeworkRow) => {
    if (!h.dueOn)
      return (
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {t('hw.noDue')}
        </p>
      );
    const n = daysBetween(today, h.dueOn);
    const label = n === 0 ? t('hw.dueToday') : n === 1 ? t('hw.dueTomorrow') : n > 1 ? t('hw.inDays', { n }) : n === -1 ? t('hw.wasYesterday') : t('hw.wasDaysAgo', { n: -n });
    return (
      <div>
        <p className="text-[13px] leading-[19px] whitespace-nowrap">
          {fmt.date(h.dueOn, 'short')}
        </p>
        {n >= 0 ? (
          <div className="mt-1">
            <StatusPill tone={n <= 1 ? 'warning' : 'neutral'}>{label}</StatusPill>
          </div>
        ) : (
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground whitespace-nowrap">
            {label}
          </p>
        )}
      </div>
    );
  };

  const columns: Column<HomeworkRow>[] = [
    {
      id: 'title',
      header: t('hw.col.homework'),
      width: '36%',
      rowHeader: true,
      sort: (h) => h.title,
      csv: (h) => (h.instructions ? `${h.title} — ${h.instructions}` : h.title),
      cell: (h) => (
        <>
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{h.title}</h6>
          {h.instructions && (
            <p className="text-[13px] leading-[19px] text-muted-foreground line-clamp-2 overflow-hidden mt-0.5 font-normal">
              {h.instructions}
            </p>
          )}
        </>
      ),
    },
    { id: 'section', header: t('hw.col.class'), sort: (h) => h.section, cell: (h) => <div className="whitespace-nowrap">{h.section}</div> },
    { id: 'subject', header: t('hw.col.subject'), sort: (h) => h.subject, hideBelow: 'sm', cell: (h) => <div className="whitespace-nowrap">{h.subject}</div> },
    { id: 'teacher', header: t('hw.col.teacher'), sort: (h) => h.teacher, hideBelow: 'md', cell: (h) => <div className="whitespace-nowrap">{h.teacher}</div> },
    {
      id: 'set',
      header: t('hw.col.set'),
      sort: (h) => h.createdAt,
      csv: (h) => h.createdAt,
      hideBelow: 'md',
      cell: (h) => <div className="whitespace-nowrap text-muted-foreground">{fmt.dateTime(h.createdAt, timezone)}</div>,
    },
    { id: 'due', header: t('hw.col.due'), sort: (h) => h.dueOn ?? '', csv: (h) => h.dueOn ?? '', cell: due },
  ];

  const uniq = (pick: (h: HomeworkRow) => string) => [...new Set(rows.map(pick))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));

  return (
    <DataTable
      testId="homework-table"
      label={t('nav.homework')}
      rows={rows}
      rowId={(h) => h.id}
      columns={columns}
      exportName="homework"
      searchText={(h) => `${h.title} ${h.instructions ?? ''} ${h.section} ${h.subject} ${h.teacher}`}
      filters={[
        { id: 'section', label: t('hw.col.class'), options: uniq((h) => h.section), match: (h, v) => h.section === v },
        { id: 'teacher', label: t('hw.col.teacher'), options: uniq((h) => h.teacher), match: (h, v) => h.teacher === v },
      ]}
    />
  );
}
