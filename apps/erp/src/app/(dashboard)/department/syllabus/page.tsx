import ArrowBack from '@mui/icons-material/ArrowBack';
import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { formatPercent } from '@/lib/department';
import type { Coverage, CourseOutline, Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dept.syllabus.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One class's syllabus: every topic of the subject's course, and which have been taught (GET /v1/coverage). */
export default async function ClassSyllabusPage({ searchParams }: { searchParams: Promise<{ section?: string; subject?: string }> }) {
  await requireSection('department');
  const { t, fmt } = await getI18n();
  const { section, subject } = await searchParams;
  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href="/department" size="small" startIcon={<ArrowBack />}>
        {t('nav.department')}
      </LinkButton>
    </Box>
  );
  if (!section || !subject || !UUID.test(section) || !UUID.test(subject))
    return (
      <>
        {back}
        <ErrorState message={t('error.NOT_FOUND')} />
      </>
    );
  const data = await load(async () => {
    const [coverage, structure] = await Promise.all([api<Coverage>(`/v1/coverage?sectionId=${section}&subjectId=${subject}`), api<Structure>('/v1/admin/structure')]);
    const subj = structure.subjects.find((s) => s.id === subject);
    const course = subj?.courseId ? await api<CourseOutline>(`/v1/content/courses/${subj.courseId}`) : null;
    return { coverage, course, subject: subj, section: structure.sections.find((s) => s.id === section) };
  });
  if (data.error !== undefined)
    return (
      <>
        {back}
        <PageHeader title={t('dept.syllabus.title')} />
        <ErrorState message={data.error} />
      </>
    );
  const { coverage, course } = data.data;
  const covered = new Map(coverage.topics.map((x) => [x.topicId, x]));
  const title = [data.data.section?.displayName, data.data.subject?.name].filter(Boolean).join(' · ');
  return (
    <>
      {back}
      <PageHeader
        title={title || t('dept.syllabus.title')}
        subtitle={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }} data-testid="syllabus-progress">
            <Box component="span" sx={{ width: 120, display: 'inline-block' }}>
              <MiniBar value={coverage.percent ?? 0} />
            </Box>
            {t('dept.syllabus.title')}: {formatPercent(coverage.percent)} · {t('dept.syllabus.topics', { covered: coverage.covered, total: coverage.total })}
          </Box>
        }
      />
      {!course || course.chapters.length === 0 ? (
        <EmptyState dense icon={<RadioButtonUnchecked />} title={course ? t('dept.syllabus.empty') : t('dept.syllabus.none')}>
          {course ? undefined : t('dept.syllabus.noneHelp')}
        </EmptyState>
      ) : (
        course.chapters.map((ch) => (
          <Box key={ch.id} component="section">
            <SectionTitle>{ch.title}</SectionTitle>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', overflow: 'hidden' }}>
              {ch.topics.map((tp, i) => {
                const c = covered.get(tp.id);
                return (
                  <Box
                    component="li"
                    key={tp.id}
                    data-testid="syllabus-topic"
                    data-covered={c ? 'true' : 'false'}
                    sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', px: 2, py: 1.25, borderTop: i ? 1 : 0, borderColor: 'm3.outlineVariant' }}
                  >
                    {c ? <CheckCircle sx={{ color: 'kx.success', mt: '2px' }} fontSize="small" /> : <RadioButtonUnchecked sx={{ color: 'text.disabled', mt: '2px' }} fontSize="small" />}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body1">{tp.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c ? t('dept.syllabus.covered', { date: fmt.date(c.coveredOn, 'day'), name: c.coveredBy }) : t('dept.syllabus.notYet')}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))
      )}
    </>
  );
}
