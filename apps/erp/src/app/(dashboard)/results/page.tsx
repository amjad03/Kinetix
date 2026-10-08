import ChevronRight from '@mui/icons-material/ChevronRight';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { AssessmentsTable } from '@/components/results/ResultsTables';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { PublishedChip } from '@/components/results/PublishedChip';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { formatMarks } from '@/lib/results';
import { resultClasses } from '@/lib/results-data';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.results') };
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
            <AssessmentsTable rows={rows} />
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
