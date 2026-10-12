'use client';
import { MiniBar } from '@/components/Bars';
import { LinkButton } from '@/components/LinkButton';
import { PublishedChip } from '@/components/results/PublishedChip';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import { formatMarks, kindLabel, percent } from '@/lib/results';
import type { AssessmentDetail, AssessmentSummary } from '@/lib/types';

import { ChevronRight } from 'lucide-react';

function Average({ a, t }: { a: AssessmentSummary; t: TFunction }) {
  if (a.average === null)
    return (
      <p className="text-[13px] leading-[19px] text-muted-foreground">
        —
      </p>
    );
  const p = percent(a.average, a.maxMarks);
  return (
    <div className="flex items-center gap-3 justify-end" data-testid="assessment-average">
      <div className="w-[48px] md:w-[72px]">
        <MiniBar value={p} label={t('results.classAverage', { p: `${p.toFixed(0)}%` })} />
      </div>
      <p className="text-[13px] leading-[19px] min-w-[92px] text-right tabular-nums">
        {formatMarks(a.average)} / {formatMarks(a.maxMarks)}
        <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground block">
          {p.toFixed(1)}%
        </span>
      </p>
    </div>
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
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{a.title}</h6>
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {a.subject.name} · {kindLabel(a.kind, t)} · {t('results.outOf', { n: formatMarks(a.maxMarks) })} · {a.createdBy}
          </span>
        </>
      ),
    },
    { id: 'heldOn', header: t('results.col.heldOn'), sort: (a) => a.heldOn, csv: (a) => a.heldOn, cell: (a) => <div className="whitespace-nowrap">{fmt.date(a.heldOn, 'short')}</div> },
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
    { id: 'roll', header: t('results.col.roll'), sort: (s) => s.rollNo ?? '', cell: (s) => <span className="text-muted-foreground whitespace-nowrap tabular-nums">{s.rollNo ?? '—'}</span> },
    { id: 'student', header: t('results.col.student'), rowHeader: true, sort: (s) => s.fullName, cell: (s) => s.fullName },
    {
      id: 'marks',
      header: t('results.col.marks'),
      align: 'right',
      sort: (s) => (s.absent ? -1 : s.marks),
      csv: (s) => (s.absent ? t('results.absent') : s.marks === null ? '' : formatMarks(s.marks)),
      cell: (s) => (
        <span className="whitespace-nowrap tabular-nums">
          {s.absent ? (
            <span data-status="absent">
              <StatusPill tone="neutral">{t('results.absent')}</StatusPill>
            </span>
          ) : s.marks === null ? (
            <span className="text-[13px] leading-[19px] text-muted-foreground">
              {t('results.notEntered')}
            </span>
          ) : (
            <>
              <strong>{formatMarks(s.marks)}</strong>
              <span className="text-[13px] leading-[19px] text-muted-foreground">
                {' '}
                / {formatMarks(maxMarks)}
              </span>
            </>
          )}
        </span>
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
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-[48px]">
                <MiniBar value={p} color={p < 40 ? 'error.main' : 'primary.main'} label={`${p.toFixed(0)}%`} />
              </div>
              <p className="text-[13px] leading-[19px] min-w-[44px] text-right tabular-nums">
                {p.toFixed(0)}%
              </p>
            </div>
          )
        );
      },
    },
    { id: 'remark', header: t('results.col.remark'), sort: (s) => s.remark ?? '', cell: (s) => <span className="text-muted-foreground">{s.remark ?? ''}</span> },
  ];
  return <DataTable testId="marks-table" label={t('results.marks')} rows={rows} rowId={(s) => s.id} exportName="marks" rowAttrs={() => ({ 'data-testid': 'mark-row' })} columns={columns} />;
}
