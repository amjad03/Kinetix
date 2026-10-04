import ForumOutlined from '@mui/icons-material/ForumOutlined';
import type { Metadata } from 'next';
import { AuditNote } from '@/components/conversations/AuditNote';
import { ThreadList } from '@/components/conversations/ThreadList';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import type { ConversationSummary } from '@/lib/types';

export const metadata: Metadata = { title: 'Parent messages' };

export default async function ConversationsPage() {
  await requireSection('conversations');
  const threads = await load(() => api<ConversationSummary[]>('/v1/conversations?all=true'));
  return (
    <>
      <PageHeader title="Parent messages" subtitle="Conversations between families and teachers, for safeguarding. Read-only." />
      <AuditNote>
        Message text is hidden here. Opening a conversation shows it and is recorded in the audit log with your name and the time.
      </AuditNote>
      {threads.error !== undefined ? (
        <ErrorState message={threads.error} />
      ) : threads.data.length === 0 ? (
        <EmptyState icon={<ForumOutlined />} title="No conversations yet" testId="no-threads">
          When a parent and a teacher message each other in the KINETIX apps, the conversation is listed here.
        </EmptyState>
      ) : (
        <ThreadList threads={threads.data} timeZone={TIMEZONE} />
      )}
    </>
  );
}
