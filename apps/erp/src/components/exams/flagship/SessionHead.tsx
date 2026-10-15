import { notFound } from 'next/navigation';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { getI18n } from '@/i18n/server';
import { api, ApiError, load } from '@/lib/api';
import type { ExamSessionDetail } from '@/lib/exams';
import { SessionTabs, type SessionTab } from './SessionTabs';

import { ArrowLeft as ArrowBack } from 'lucide-react';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads an exam session for one of its pages (404 when it does not exist) and builds the back link, header and tabs. */
export async function sessionHead(id: string, tab: SessionTab, subtitle: string) {
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
  const head = (
    <>
      <div className="-ml-2 mb-1">
        <LinkButton href="/exams" size="small" startIcon={<ArrowBack />}>
          {t('exm.back')}
        </LinkButton>
      </div>
      {session.data && <PageHeader title={session.data.name} subtitle={subtitle} />}
      <SessionTabs sessionId={id} current={tab} />
    </>
  );
  return { session, head };
}
