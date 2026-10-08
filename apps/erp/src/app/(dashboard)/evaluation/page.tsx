import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { EvaluationDesk } from '@/components/evaluation/EvaluationDesk';
import { SessionPapers, SessionPicker } from '@/components/evaluation/Pickers';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { EvalOverview, StaffMember } from '@/lib/evaluation';
import type { ExamSession, ExamSessionDetail } from '@/lib/exams';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.evaluation') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** On-screen evaluation: pick a session, then a paper, then work its scripts. */
export default async function EvaluationPage({ searchParams }: { searchParams: Promise<{ session?: string; paper?: string }> }) {
  await requireSection('evaluation');
  const { session, paper } = await searchParams;
  const { t } = await getI18n();
  const header = <PageHeader title={t('nav.evaluation')} subtitle={t('ev.subtitle')} />;

  if (session && UUID.test(session) && paper && UUID.test(paper)) {
    const [overview, staff] = await Promise.all([load(() => api<EvalOverview>(`/v1/evaluation/papers/${paper}`)), load(() => api<StaffMember[]>('/v1/admin/staff'))]);
    const failed = overview.error ?? staff.error;
    return (
      <>
        {header}
        <Box sx={{ ml: -1, mb: 1 }}>
          <LinkButton href={`/evaluation?session=${session}`} size="small">
            {t('ev.backPapers')}
          </LinkButton>
        </Box>
        {failed !== undefined ? <ErrorState message={failed} /> : <EvaluationDesk paperId={paper} overview={overview.data!} staff={staff.data ?? []} />}
      </>
    );
  }

  if (session && UUID.test(session)) {
    const detail = await load(() => api<ExamSessionDetail>(`/v1/exam-sessions/${session}`));
    return (
      <>
        {header}
        <Box sx={{ ml: -1, mb: 1 }}>
          <LinkButton href="/evaluation" size="small">
            {t('ev.back')}
          </LinkButton>
        </Box>
        {detail.error !== undefined ? <ErrorState message={detail.error} /> : <SessionPapers session={detail.data!} />}
      </>
    );
  }

  const sessions = await load(() => api<ExamSession[]>('/v1/exam-sessions'));
  return (
    <>
      {header}
      {sessions.error !== undefined ? <ErrorState message={sessions.error} /> : <SessionPicker sessions={sessions.data ?? []} />}
    </>
  );
}
