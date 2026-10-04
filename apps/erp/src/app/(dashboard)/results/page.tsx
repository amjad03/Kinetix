import ChevronRight from '@mui/icons-material/ChevronRight';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { PublishedChip } from '@/components/results/PublishedChip';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { TFunction } from '@/i18n/translate';
import { formatMarks, kindLabel, percent } from '@/lib/results';
import { resultClasses } from '@/lib/results-data';
import type { AssessmentSummary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.results') };
}

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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-end' }}>
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

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  await requireSection('results');
  const sp = await searchParams;
  const classes = await load(resultClasses);
  const list = classes.data ?? [];
  const klass = list.find((c) => c.id === sp.class) ?? list.find((c) => c.assessments.length > 0) ?? list[0];
  const rows = klass?.assessments ?? [];
  const published = rows.filter((a) => a.publishedAt).length;
  const { t, fmt } = await getI18n();

  return (
    <>
      <PageHeader
        title={t('nav.results')}
        subtitle={t('results.subtitle')}
        actions={
          list.length > 0 && klass ? (
            <UrlSelect label={t('results.class')} param="class" value={klass.id} options={list.map((c) => ({ value: c.id, label: c.name }))} testId="results-class" />
          ) : undefined
        }
      />
      {classes.error !== undefined ? (
        <ErrorState message={classes.error} />
      ) : !klass ? (
        <EmptyState icon={<GradingOutlined />} title={t('results.noClasses')} testId="no-result-classes">
          {t('results.noClassesBody')}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={<GradingOutlined />} title={t('results.noAssessments', { name: klass.name })} testId="no-assessments">
          {t('results.noAssessmentsBody')}
        </EmptyState>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }} data-testid="results-summary">
            {t('results.summary', { name: klass.name, students: klass.students, assessments: t.plural('results.assessments', rows.length), published })}
          </Typography>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <TableFrame testId="assessments-table">
              <Table sx={{ minWidth: 860 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('results.col.assessment')}</TableCell>
                    <TableCell>{t('results.col.heldOn')}</TableCell>
                    <TableCell align="right">{t('results.col.entered')}</TableCell>
                    <TableCell align="right">{t('results.col.average')}</TableCell>
                    <TableCell>{t('results.col.status')}</TableCell>
                    <TableCell aria-label={t('results.col.open')} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((a) => {
                    return (
                      <TableRow key={a.id} hover data-testid="assessment-row">
                        <TableCell>
                          <Typography variant="subtitle2">{a.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {a.subject.name} · {kindLabel(a.kind, t)} · {t('results.outOf', { n: formatMarks(a.maxMarks) })} · {a.createdBy}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmt.date(a.heldOn, 'short')}</TableCell>
                        <TableCell align="right" sx={num} data-testid="assessment-entered">
                          {t('results.entered', { n: a.entered, d: a.classSize })}
                        </TableCell>
                        <TableCell align="right" data-testid="assessment-average">
                          <Average a={a} t={t} />
                        </TableCell>
                        <TableCell>
                          <PublishedChip publishedAt={a.publishedAt} />
                        </TableCell>
                        <TableCell align="right" padding="checkbox" sx={{ pr: 1 }}>
                          <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} aria-label={t('results.marksFor', { title: a.title })}>
                            {t('results.marks')}
                          </LinkButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableFrame>
          </Box>
          <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }}>
            {rows.map((a) => (
              <Box key={a.id} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                    {a.title}
                  </Typography>
                  <PublishedChip publishedAt={a.publishedAt} />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {a.subject.name} · {fmt.date(a.heldOn, 'short')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {t('results.averageLine', { avg: a.average === null ? '—' : `${formatMarks(a.average)} / ${formatMarks(a.maxMarks)}`, n: a.entered, d: a.classSize })}
                </Typography>
                <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} sx={{ mt: 1, ml: -1 }}>
                  {t('results.marks')}
                </LinkButton>
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
}
