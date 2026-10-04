import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { ComposeMessage } from '@/components/messages/ComposeMessage';
import { SentMessages } from '@/components/messages/SentMessages';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, getMe, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import type { SentBroadcast, Structure } from '@/lib/types';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage() {
  await requireSection('school');
  const [me, structure, sent] = await Promise.all([
    getMe(),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<SentBroadcast[]>('/v1/broadcasts')),
  ]);
  const active = sent.data?.filter((b) => b.active).length ?? 0;

  return (
    <>
      <PageHeader title="Messages" subtitle="Circulate notices to classroom boards, students and families" />
      {structure.error !== undefined ? (
        <ErrorState message={structure.error} />
      ) : (
        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
          <ComposeMessage structure={structure.data} />
          <Box component="section" aria-labelledby="sent-title">
            <SectionTitle id="sent-title" flush>
              Sent{sent.data ? ` · ${sent.data.length}` : ''}
              {active ? ` · ${active} active` : ''}
            </SectionTitle>
            {sent.error !== undefined ? (
              <ErrorState message={sent.error} />
            ) : (
              <SentMessages
                items={sent.data}
                structure={structure.data}
                timeZone={TIMEZONE}
                userId={me.id}
                isAdmin={me.roles.some((r) => r === 'principal' || r === 'tenant_admin')}
              />
            )}
          </Box>
        </Box>
      )}
    </>
  );
}
