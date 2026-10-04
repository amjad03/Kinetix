import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { ComposeMessage } from '@/components/messages/ComposeMessage';
import { SentMessages } from '@/components/messages/SentMessages';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, getMe, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { SentBroadcast, Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.messages') };
}

export default async function MessagesPage() {
  await requireSection('school');
  const [me, structure, sent] = await Promise.all([
    getMe(),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<SentBroadcast[]>('/v1/broadcasts')),
  ]);
  const active = sent.data?.filter((b) => b.active).length ?? 0;
  const { t } = await getI18n();

  return (
    <>
      <PageHeader title={t('nav.messages')} subtitle={t('msg.subtitle')} />
      {structure.error !== undefined ? (
        <ErrorState message={structure.error} />
      ) : (
        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
          <ComposeMessage structure={structure.data} />
          <Box component="section" aria-labelledby="sent-title">
            <SectionTitle id="sent-title" flush>
              {t('msg.sent')}
              {sent.data ? ` · ${sent.data.length}` : ''}
              {active ? ` · ${t('msg.active', { n: active })}` : ''}
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
