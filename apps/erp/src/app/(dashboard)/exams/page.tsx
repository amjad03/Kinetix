import type { Metadata } from 'next';
import { ExamSessionsDesk } from '@/components/exams/ExamSessionsDesk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { canPublishMarks } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { ExamSession } from '@/lib/exams';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.exams') };
}

export default async function ExamsPage() {
  const me = await requireSection('exams');
  const [sessions, structure] = await Promise.all([load(() => api<ExamSession[]>('/v1/exam-sessions')), load(() => api<Structure>('/v1/admin/structure'))]);
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t('nav.exams')} subtitle={t('exm.subtitle')} actions={<><LinkButton href="/exams/schemes" variant="outlined">{t('exm.schemes')}</LinkButton><LinkButton href="/exams/operations" variant="outlined">{t('dx.link.exams')}</LinkButton></>} />
      {sessions.error !== undefined || structure.error !== undefined ? (
        <ErrorState message={(sessions.error ?? structure.error)!} />
      ) : (
        <ExamSessionsDesk sessions={sessions.data} structure={structure.data} canManage={!!me && canPublishMarks(me.roles)} />
      )}
    </>
  );
}
