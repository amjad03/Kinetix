'use client';

import ChevronRight from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MiniBar } from '@/components/Bars';
import { LinkButton } from '@/components/LinkButton';
import { PublishedChip } from '@/components/results/PublishedChip';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import { formatMarks, kindLabel, percent } from '@/lib/results';
import type { AssessmentDetail, AssessmentSummary } from '@/lib/types';

const num = { fontVariantNumeric: 'tabular-nums' } as const;

function Average({ a, t }: { a: AssessmentSummary; t: TFunction }) {
  if (a.average === null)
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  const p = percent(a.average, a.maxMarks);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-end' }} data-testid="assessment-average">
      <Box sx={{ width: { xs: 48, md: 72 } }}>
        <MiniBar value={p} label={t('results.classAverage', { p: `${p.toFixed(0)}%` })} />
      </Box>
      <Typography variant="body2" sx={{ ...num, minWidth: 92, textAlign: 'right' }}>
        {formatMarks(a.average)} / {formatMarks(a.maxMarks)}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {p.toFixed(1)}%
        </Typography>
      </Typography>
    </Box>
  );
}

/** A class's assessments: search, sort by date, average or status, and CSV export. */
export function AssessmentsTable({ rows }: { rows: AssessmentSummary[] }) {
  const { t, fmt } = useI18n();
  const columns: Column<AssessmentSummary>[] = [
    {
      id: 'assessment',
      header: t('results.col.assessment'),
      rowHeader: true,
      sort: (a) => a.title,
      csv: (a) => `${a.title} (${a.subject.name}, ${kindLabel(a.kind, t)}, ${t('results.outOf', { n: formatMarks(a.maxMarks) })})`,
      cell: (a) => (
        <>
          <Typography variant="subtitle2">{a.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {a.subject.name} · {kindLabel(a.kind, t)} · {t('results.outOf', { n: formatMarks(a.maxMarks) })} · {a.createdBy}
          </Typography>
        </>
      ),
    },
    { id: 'heldOn', header: t('results.col.heldOn'), sort: (a) => a.heldOn, csv: (a) => a.heldOn, cell: (a) => <Box sx={{ whiteSpace: 'nowrap' }}>{fmt.date(a.heldOn, 'short')}</Box> },
    { id: 'entered', header: t('results.col.entered'), align: 'right', sort: (a) => a.entered, csv: (a) => `${a.entered}/${a.classSize}`, cell: (a) => <span data-testid="assessment-entered">{t('results.entered', { n: a.entered, d: a.classSize })}</span> },
    { id: 'average', header: t('results.col.average'), align: 'right', sort: (a) => (a.average === null ? null : percent(a.average, a.maxMarks)), csv: (a) => (a.average === null ? '' : formatMarks(a.average)), cell: (a) => <Average a={a} t={t} /> },
    { id: 'status', header: t('results.col.status'), sort: (a) => a.publishedAt ?? '', csv: (a) => (a.publishedAt ? a.publishedAt.slice(0, 10) : ''), cell: (a) => <PublishedChip publishedAt={a.publishedAt} /> },
    {
      id: 'open',
      header: '',
      csv: false,
      align: 'right',
      cell: (a) => (
        <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} aria-label={t('results.marksFor', { title: a.title })}>
          {t('results.marks')}
        </LinkButton>
      ),
    },
  ];
  return (
    <DataTable
      testId="assessments-table"
      label={t('nav.results')}
      rows={rows}
      rowId={(a) => a.id}
      exportName="assessments"
      rowAttrs={() => ({ 'data-testid': 'assessment-row' })}
      filters={[{ id: 'status', label: t('results.col.status'), options: [{ value: 'published', label: t('results.publishedLabel') }, { value: 'draft', label: t('results.draft') }], match: (a, v) => (v === 'published' ? !!a.publishedAt : !a.publishedAt) }]}
      columns={columns}
    />
  );
}

type MarkRow = AssessmentDetail['students'][number];

/** The marks of one assessment, student by student. */
export function MarksListTable({ rows, maxMarks }: { rows: MarkRow[]; maxMarks: number }) {
  const { t } = useI18n();
  const pct = (m: MarkRow) => (m.marks === null ? null : percent(m.marks, maxMarks));
  const columns: Column<MarkRow>[] = [
    { id: 'roll', header: t('results.col.roll'), sort: (s) => s.rollNo ?? '', cell: (s) => <Box component="span" sx={{ ...num, color: 'text.secondary', whiteSpace: 'nowrap' }}>{s.rollNo ?? '—'}</Box> },
    { id: 'student', header: t('results.col.student'), rowHeader: true, sort: (s) => s.fullName, cell: (s) => s.fullName },
    {
      id: 'marks',
      header: t('results.col.marks'),
      align: 'right',
      sort: (s) => (s.absent ? -1 : s.marks),
      csv: (s) => (s.absent ? t('results.absent') : s.marks === null ? '' : formatMarks(s.marks)),
      cell: (s) => (
        <Box component="span" sx={{ ...num, whiteSpace: 'nowrap' }}>
          {s.absent ? (
            <span data-status="absent">
              <StatusPill tone="neutral">{t('results.absent')}</StatusPill>
            </span>
          ) : s.marks === null ? (
            <Typography variant="body2" color="text.secondary" component="span">
              {t('results.notEntered')}
            </Typography>
          ) : (
            <>
              <strong>{formatMarks(s.marks)}</strong>
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}
                / {formatMarks(maxMarks)}
              </Typography>
            </>
          )}
        </Box>
      ),
    },
    {
      id: 'score',
      header: t('results.col.score'),
      hideBelow: 'sm',
      width: '26%',
      sort: pct,
      csv: (s) => {
        const p = pct(s);
        return p === null ? '' : `${p.toFixed(0)}%`;
      },
      cell: (s) => {
        const p = pct(s);
        return (
          p !== null && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 48 }}>
                <MiniBar value={p} color={p < 40 ? 'error.main' : 'primary.main'} label={`${p.toFixed(0)}%`} />
              </Box>
              <Typography variant="body2" sx={{ ...num, minWidth: 44, textAlign: 'right' }}>
                {p.toFixed(0)}%
              </Typography>
            </Box>
          )
        );
      },
    },
    { id: 'remark', header: t('results.col.remark'), sort: (s) => s.remark ?? '', cell: (s) => <Box component="span" sx={{ color: 'text.secondary' }}>{s.remark ?? ''}</Box> },
  ];
  return <DataTable testId="marks-table" label={t('results.marks')} rows={rows} rowId={(s) => s.id} exportName="marks" rowAttrs={() => ({ 'data-testid': 'mark-row' })} columns={columns} />;
}
