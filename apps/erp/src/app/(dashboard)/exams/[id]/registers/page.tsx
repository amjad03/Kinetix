import type { Metadata } from 'next';
import { RegistersDesk } from '@/components/exams/flagship/RegistersDesk';
import { sessionHead } from '@/components/exams/flagship/SessionHead';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { SeatingPlanOverview } from '@/lib/exam-registration';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('xf.tabs.registers') };
}

/** The printed registers of a session (attendance sheets, D-forms, tabulation) and any candidate's marks ledger. */
export default async function RegistersPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('exams');
  const { id } = await params;
  const { t } = await getI18n();
  const { session, head } = await sessionHead(id, 'registers', t('xf.reg.subtitle'));
  if (!session.data)
    return (
      <>
        {head}
        <ErrorState message={session.error!} />
      </>
    );
  const [plan, candidates] = await Promise.all([
    load(() => api<SeatingPlanOverview | null>(`/v1/exam-sessions/${id}/seating-plan`)),
    load(() => api<{ id: string; rollNo: string; name: string; section: string }[]>(`/v1/exam-sessions/${id}/candidates`)),
  ]);
  return (
    <>
      {head}
      <RegistersDesk sessionId={id} status={session.data.status} papers={session.data.papers} plan={plan.data ?? null} candidates={(candidates.data ?? []).map((c) => ({ id: c.id, label: `${c.rollNo} ${c.name} (${c.section})` }))} />
    </>
  );
}
