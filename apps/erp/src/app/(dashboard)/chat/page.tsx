import type { Metadata } from 'next';
import { ChatView } from '@/components/chat/ChatView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ChatMember, ChatMessage, ChatPerson, ChatThread } from '@/lib/chat';
import type { Structure } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('v2.chat.title') };
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Messages (redesign v2): staff threads and external contacts by email or WhatsApp. */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ t?: string; tab?: string }> }) {
  const me = await requireSection('chat');
  const { t: sel, tab } = await searchParams;
  const [threads, people] = await Promise.all([load(() => api<ChatThread[]>('/v1/chat/threads')), load(() => api<ChatPerson[]>('/v1/chat/people'))]);
  if (threads.error !== undefined) return <ErrorState message={threads.error} />;
  const id = sel && UUID.test(sel) ? sel : threads.data[0]?.id;
  const open = id ? await load(() => api<{ thread: ChatThread; members: ChatMember[]; messages: ChatMessage[] }>(`/v1/chat/threads/${id}`)) : null;
  // Class and club groups: the classes and clubs this person may open a group for (empty when the API says no).
  const canGroup = (me?.roles ?? []).some((r) => ['tenant_admin', 'principal', 'hod', 'teacher'].includes(r));
  const [structure, clubs] = canGroup ? await Promise.all([load(() => api<Structure>('/v1/admin/structure')), load(() => api<{ id: string; name: string }[]>('/v1/campus-life/clubs'))]) : [null, null];
  const groupSources = canGroup ? { sections: (structure?.data?.sections ?? []).map((s) => ({ id: s.id, name: s.displayName })), clubs: (clubs?.data ?? []).map((c) => ({ id: c.id, name: c.name })) } : undefined;
  return <ChatView meId={me?.id ?? ''} threads={threads.data} people={people.data ?? []} open={open?.data ?? null} tab={tab ?? 'all'} groupSources={groupSources} />;
}
