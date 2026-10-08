'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
        <Typography variant="body2" color="text.secondary">
          {t('hw.noDue')}
        </Typography>
      );
    const n = daysBetween(today, h.dueOn);
    const label = n === 0 ? t('hw.dueToday') : n === 1 ? t('hw.dueTomorrow') : n > 1 ? t('hw.inDays', { n }) : n === -1 ? t('hw.wasYesterday') : t('hw.wasDaysAgo', { n: -n });
    return (
      <Box>
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {fmt.date(h.dueOn, 'short')}
        </Typography>
        {n >= 0 ? (
          <Box sx={{ mt: 0.5 }}>
            <StatusPill tone={n <= 1 ? 'warning' : 'neutral'}>{label}</StatusPill>
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ whiteSpace: 'nowrap' }}>
            {label}
          </Typography>
        )}
      </Box>
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
          <Typography variant="subtitle2">{h.title}</Typography>
          {h.instructions && (
            <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mt: 0.25, fontWeight: 400 }}>
              {h.instructions}
            </Typography>
          )}
        </>
      ),
    },
    { id: 'section', header: t('hw.col.class'), sort: (h) => h.section, cell: (h) => <Box sx={{ whiteSpace: 'nowrap' }}>{h.section}</Box> },
    { id: 'subject', header: t('hw.col.subject'), sort: (h) => h.subject, hideBelow: 'sm', cell: (h) => <Box sx={{ whiteSpace: 'nowrap' }}>{h.subject}</Box> },
    { id: 'teacher', header: t('hw.col.teacher'), sort: (h) => h.teacher, hideBelow: 'md', cell: (h) => <Box sx={{ whiteSpace: 'nowrap' }}>{h.teacher}</Box> },
    {
      id: 'set',
      header: t('hw.col.set'),
      sort: (h) => h.createdAt,
      csv: (h) => h.createdAt,
      hideBelow: 'md',
      cell: (h) => <Box sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{fmt.dateTime(h.createdAt, timezone)}</Box>,
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
