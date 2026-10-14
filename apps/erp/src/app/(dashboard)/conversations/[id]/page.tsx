import { notFound, redirect } from 'next/navigation';
import { getMe, requireSection } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Older links to one thread open it in the chat (leaders in the safeguarding view, which lists every thread). */
export default async function ConversationLink({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('conversations');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await getMe();
  const leader = me.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  redirect(`/conversations?t=${id}${leader ? '&view=all' : ''}`);
}
