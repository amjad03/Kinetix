import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuditNote } from '@/components/conversations/AuditNote';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { senderSide } from '@/lib/conversations';
import { getI18n } from '@/i18n/server';
import { TIMEZONE } from '@/lib/school';
import type { ConversationThread } from '@/lib/types';

import { ArrowLeft as ArrowBack } from 'lucide-react';
import { cn } from '@/lib/utils';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('conv.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('conversations');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Reading the thread as a leader is audited by the API (conversation.read_by_leader).
  const res = await load(async () => {
    try {
      return await api<ConversationThread>(`/v1/conversations/${id}/messages`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });

  const { t, fmt } = await getI18n();
  const back = (
    <div className="-ml-2 mb-1">
      <LinkButton href="/conversations" size="small" startIcon={<ArrowBack />}>
        {t('nav.conversations')}
      </LinkButton>
    </div>
  );
  if (res.error !== undefined)
    return (
      <>
        {back}
        <ErrorState message={res.error} />
      </>
    );
  const { conversation: c, messages } = res.data;

  return (
    <>
      {back}
      <PageHeader title={t('conv.pair', { family: c.family.fullName, staff: c.staff.fullName })} subtitle={t('conv.aboutReadOnly', { student: c.student.fullName, className: c.className })} />
      <AuditNote>{t('conv.auditThread')}</AuditNote>
      {messages.length === 0 ? (
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {t('conv.noMessagesYet')}
        </p>
      ) : (
        <div className="grid gap-3 max-w-[760px]" data-testid="thread">
          {messages.map((m) => {
            const side = senderSide(m, c);
            const staff = side === 'staff';
            return (
              <div className={cn('flex', staff ? 'justify-end' : 'justify-start')} key={m.id} data-testid="message" data-side={side}>
                <div className={cn('max-w-[82%] px-4 py-2.5', staff ? 'rounded-[16px_16px_4px_16px]' : 'rounded-[16px_16px_16px_4px]', staff ? 'bg-secondary' : 'bg-accent', staff ? 'text-secondary-foreground' : 'text-foreground')}
                >
                  <span className="text-xs leading-4 tracking-[0.3px] font-medium block mb-0.5">
                    {side === 'staff' ? t('conv.asTeacher', { name: c.staff.fullName }) : side === 'family' ? t('conv.asParent', { name: c.family.fullName }) : 'ZYNETIX'}
                  </span>
                  <p className="text-[13px] leading-[19px] whitespace-pre-wrap wrap-anywhere">
                    {m.body}
                  </p>
                  <span className="text-xs leading-4 tracking-[0.3px] block mt-1 opacity-[0.7] text-right">
                    {fmt.dateTime(m.createdAt, TIMEZONE)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
