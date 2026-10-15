import type { Metadata } from 'next';
import { ApplicationsDesk } from '@/components/exams/flagship/ApplicationsDesk';
import { sessionHead } from '@/components/exams/flagship/SessionHead';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { canPublishMarks } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { ApplicationRow } from '@/lib/exam-flagship';
import type { RegistrationWindow } from '@/lib/exam-registration';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('xf.tabs.applications') };
}

/** Examination applications of a session: subjects, eligibility, the exam fee on the fee account, overrides. */
export default async function ApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('exams');
  const { id } = await params;
  const { t } = await getI18n();
  const { session, head } = await sessionHead(id, 'applications', t('xf.app.subtitle'));
  if (!session.data)
    return (
      <>
        {head}
        <ErrorState message={session.error!} />
      </>
    );
  const [rows, candidates, win] = await Promise.all([
    load(() => api<ApplicationRow[]>(`/v1/exam-sessions/${id}/applications`)),
    load(() => api<{ id: string; rollNo: string; name: string; section: string }[]>(`/v1/exam-sessions/${id}/candidates`)),
    load(() => api<RegistrationWindow | null>(`/v1/exam-sessions/${id}/registration-window`)),
  ]);
  return (
    <>
      {head}
      {rows.error !== undefined ? (
        <ErrorState message={rows.error} />
      ) : (
        <ApplicationsDesk
          sessionId={id}
          rows={rows.data}
          candidates={(candidates.data ?? []).map((c) => ({ id: c.id, label: `${c.rollNo} ${c.name} (${c.section})` }))}
          canManage={!!me && canPublishMarks(me.roles)}
          windowState={win.data?.state ?? null}
        />
      )}
    </>
  );
}
