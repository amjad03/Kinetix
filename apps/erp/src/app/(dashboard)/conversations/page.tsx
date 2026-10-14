import type { Metadata } from 'next';
import { ChatSettingsPanel } from '@/components/conversations/ChatSettingsPanel';
import { FamilyChatView } from '@/components/conversations/FamilyChatView';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, ApiError, getMe, load, requireSection } from '@/lib/api';
import type { ChatSettingsView, FamilyThread, FamilyThreadPage } from '@/lib/communication';
import { TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { Structure } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.conversations') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Communication > Conversations: two-way chat with parents and students. Staff see their own and the
 * office's threads; leaders can open any thread for safeguarding (each read is audited by the API).
 */
export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ t?: string; view?: string; tab?: string }> }) {
  await requireSection('conversations');
  const { t: selected, view, tab } = await searchParams;
  const { t } = await getI18n();
  const me = await getMe();
  const isLeader = me.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  const settingsTab = tab === 'settings' && isLeader;
  const tabs = isLeader ? (
    <LinkTabs
      label={t('nav.conversations')}
      value={settingsTab ? 'settings' : 'chat'}
      items={[
        { value: 'chat', label: t('fc.tab.chat'), href: '/conversations' },
        { value: 'settings', label: t('fc.tab.settings'), href: '/conversations?tab=settings' },
      ]}
    />
  ) : null;

  if (settingsTab) {
    const [settings, people] = await Promise.all([load(() => api<ChatSettingsView>('/v1/conversations/settings')), load(() => api<{ id: string; fullName: string }[]>('/v1/chat/people'))]);
    if (settings.error !== undefined) return <ErrorState message={settings.error} />;
    const staff = [...(people.data ?? []), { id: me.id, fullName: me.fullName }].sort((a, b) => a.fullName.localeCompare(b.fullName));
    return (
      <>
        <PageHeader title={t('nav.conversations')} subtitle={t('fc.subtitle')} />
        {tabs}
        <ChatSettingsPanel settings={settings.data} staff={staff} schoolKind={settings.data.kind === 'school'} />
      </>
    );
  }

  const allView = view === 'all' && isLeader;
  const [threads, structure, people] = await Promise.all([
    load(() => api<FamilyThread[]>(`/v1/conversations${allView ? '?all=true' : ''}`)),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<{ id: string; fullName: string }[]>('/v1/chat/people')),
  ]);
  if (threads.error !== undefined) return <ErrorState message={threads.error} />;
  const id = selected && UUID.test(selected) ? selected : allView ? undefined : threads.data[0]?.id;
  // Opening a thread the leader is not part of is audited by the API (conversation.read_by_leader).
  const open = id
    ? await load(async () => {
        try {
          return await api<FamilyThreadPage>(`/v1/conversations/${id}/messages`);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }
      })
    : null;
  const used = new Set(threads.data.map((x) => x.sectionId));
  const sections = (structure.data?.sections ?? []).filter((s) => used.has(s.id)).map((s) => ({ id: s.id, displayName: s.displayName }));
  return (
    <>
      {tabs}
      <FamilyChatView
        meId={me.id}
        threads={threads.data}
        open={open?.data ?? null}
        sections={sections}
        staff={people.data ?? []}
        allView={allView}
        isLeader={isLeader}
        timeZone={TIMEZONE}
      />
    </>
  );
}
