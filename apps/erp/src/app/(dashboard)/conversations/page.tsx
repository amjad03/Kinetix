import ForumOutlined from '@mui/icons-material/ForumOutlined';
import type { Metadata } from 'next';
import { AuditNote } from '@/components/conversations/AuditNote';
import { ThreadList } from '@/components/conversations/ThreadList';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { ConversationSummary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.conversations') };
}

export default async function ConversationsPage() {
  await requireSection('conversations');
  const threads = await load(() => api<ConversationSummary[]>('/v1/conversations?all=true'));
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t('nav.conversations')} subtitle={t('conv.subtitle')} />
      <AuditNote>{t('conv.auditList')}</AuditNote>
      {threads.error !== undefined ? (
        <ErrorState message={threads.error} />
      ) : threads.data.length === 0 ? (
        <EmptyState icon={<ForumOutlined />} title={t('conv.none')} testId="no-threads">
          {t('conv.noneBody')}
        </EmptyState>
      ) : (
        <ThreadList threads={threads.data} timeZone={TIMEZONE} />
      )}
    </>
  );
}
