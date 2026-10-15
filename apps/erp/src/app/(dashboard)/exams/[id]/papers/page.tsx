import type { Metadata } from 'next';
import { AppointmentRecords } from '@/components/exams/flagship/FlagshipRecords';
import { PaperSettingDesk } from '@/components/exams/flagship/PaperSettingDesk';
import { sessionHead } from '@/components/exams/flagship/SessionHead';
import { ErrorState } from '@/components/States';
import { SectionTitle } from '@/components/PageHeader';
import { getI18n } from '@/i18n/server';
import { canPublishMarks } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { QpOverview } from '@/lib/exam-flagship';
import type { StaffMember } from '@/lib/evaluation';
import { loadRecords } from '@/lib/records-server';

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('xf.tabs.papers') };
}

/** Question paper setting of a session: setters, moderators, sets and their coverage, the draw and the release. */
export default async function PapersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const me = await requireSection('exams');
  const { id } = await params;
  const sp = await searchParams;
  const { t } = await getI18n();
  const { session, head } = await sessionHead(id, 'papers', t('xf.qp.subtitle'));
  if (!session.data)
    return (
      <>
        {head}
        <ErrorState message={session.error!} />
      </>
    );
  const [overview, staff, records] = await Promise.all([
    load(() => api<QpOverview>(`/v1/exam-sessions/${id}/qp-setting`)),
    load(() => api<StaffMember[]>('/v1/admin/staff')),
    loadRecords('qp-appointments', sp, { filters: { session: id } }),
  ]);
  const teaching = (staff.data ?? []).filter((m) => m.roles.some((r) => ['teacher', 'hod', 'principal', 'examiner', 'exam_controller'].includes(r)));
  return (
    <>
      {head}
      {overview.error !== undefined ? <ErrorState message={overview.error} /> : <PaperSettingDesk overview={overview.data} staff={teaching} canManage={!!me && canPublishMarks(me.roles)} />}
      <div className="mt-6">
        <SectionTitle>{t('xf.qp.allAppointments')}</SectionTitle>
        {records.error !== undefined ? <ErrorState message={records.error} /> : <AppointmentRecords meta={records.data.meta} page={records.data.page} state={records.data.state} />}
      </div>
    </>
  );
}
