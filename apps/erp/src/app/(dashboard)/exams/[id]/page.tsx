import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SessionDesk } from '@/components/exams/SessionDesk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { canPublishMarks } from '@/lib/access';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { ExamSessionDetail, ResultRow, Revaluation } from '@/lib/exams';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.exams') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('exams');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await load(async () => {
    try {
      return await api<ExamSessionDetail>(`/v1/exam-sessions/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const { t } = await getI18n();
  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href="/exams" size="small" startIcon={<ArrowBack />}>
        {t('exm.back')}
      </LinkButton>
    </Box>
  );
  if (!session.data)
    return (
      <>
        {back}
        <ErrorState message={session.error!} />
      </>
    );
  const [structure, results, revals] = await Promise.all([
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<ResultRow[]>(`/v1/exam-sessions/${id}/results`)),
    load(() => api<Revaluation[]>(`/v1/exam-sessions/${id}/revaluations`)),
  ]);
  return (
    <>
      {back}
      <PageHeader title={session.data.name} subtitle={t('exm.sessionSubtitle', { term: session.data.term })} />
      {structure.error !== undefined ? <ErrorState message={structure.error} /> : <SessionDesk session={session.data} structure={structure.data} results={results.data ?? []} revaluations={revals.data ?? []} canManage={!!me && canPublishMarks(me.roles)} />}
    </>
  );
}
