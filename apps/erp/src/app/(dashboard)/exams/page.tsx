import type { Metadata } from 'next';
import { ExamSessionsDesk } from '@/components/exams/ExamSessionsDesk';
import { ExamsOverview, type PublishGate } from '@/components/exams/ExamsOverview';
import { ExamsTabs } from '@/components/exams/ExamsTabs';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { canPublishMarks } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { ExamSession, ExamSessionDetail } from '@/lib/exams';
import type { Structure } from '@/lib/types';

import { FileCheck, Ticket } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.exams') };
}

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const me = await requireSection('exams');
  const sp = await searchParams;
  const [sessions, structure] = await Promise.all([load(() => api<ExamSession[]>('/v1/exam-sessions')), load(() => api<Structure>('/v1/admin/structure'))]);
  const { t, fmt } = await getI18n();
  const list = sessions.data ?? [];
  // The session in focus: the one asked for, else the latest that has moved past draft.
  const pick = list.find((x) => x.id === sp.session) ?? list.find((x) => x.status !== 'draft') ?? list[0];
  const [detail, regs, tickets, gate] = pick
    ? await Promise.all([
        load(() => api<ExamSessionDetail>(`/v1/exam-sessions/${pick.id}`)),
        load(() => api<{ status: string }[]>(`/v1/exam-sessions/${pick.id}/registrations`)),
        load(() => api<{ blocked: boolean }[]>(`/v1/exam-sessions/${pick.id}/hall-tickets`)),
        load(() => api<PublishGate>(`/v1/exam-sessions/${pick.id}/publish-approval`)),
      ])
    : [null, null, null, null];
  const roles = me?.roles ?? [];
  return (
    <>
      <PageHeader
        title={t('nav.exams')}
        subtitle={pick ? t('axr.ex.subtitle', { name: pick.name, from: fmt.date(pick.startsOn, 'short'), to: fmt.date(pick.endsOn, 'short') }) : t('exm.subtitle')}
        actions={
          <>
            {pick && (
              <LinkButton href={`/exams/${pick.id}`} variant="outlined" startIcon={<Ticket />}>
                {t('axr.ex.kpi.tickets')}
              </LinkButton>
            )}
            {pick && (
              <LinkButton href="#publish" variant="contained" startIcon={<FileCheck />}>
                {t('axr.gate.publish')}
              </LinkButton>
            )}
          </>
        }
      />
      <ExamsTabs current="sessions" roles={me?.roles} />
      {sessions.error !== undefined || structure.error !== undefined ? (
        <ErrorState message={(sessions.error ?? structure.error)!} />
      ) : (
        <div className="flex flex-col gap-6">
          {pick && detail?.data ? (
            <section id="publish" className="flex scroll-mt-20 flex-col gap-3">
              {list.length > 1 && <UrlSelect label={t('axr.ex.session')} param="session" value={pick.id} options={list.map((x) => ({ value: x.id, label: x.name }))} testId="exam-session" />}
              <ExamsOverview
                s={detail.data}
                counts={{
                  registrations: regs?.data?.length ?? 0,
                  registered: regs?.data?.filter((r) => r.status === 'registered').length ?? 0,
                  tickets: tickets?.data?.length ?? 0,
                  blocked: tickets?.data?.filter((x) => x.blocked).length ?? 0,
                }}
                gate={gate?.data ?? null}
                canManage={canPublishMarks(roles)}
                canApprove={roles.includes('principal') || roles.includes('tenant_admin')}
              />
            </section>
          ) : detail?.error ? (
            <ErrorState message={detail.error} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('axr.ex.noSession')}</p>
          )}
          <ExamSessionsDesk sessions={sessions.data} structure={structure.data} canManage={!!me && canPublishMarks(roles)} />
        </div>
      )}
    </>
  );
}
