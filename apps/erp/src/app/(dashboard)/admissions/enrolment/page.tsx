import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { AwaitingTable, FollowUpsTable, ProgrammeSettingsDesk, type Awaiting, type FollowUp } from '@/components/admissions/PassTables';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, StatGrid, StatTile } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import type { ProgrammeSetting } from '@/lib/admissions-pass';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ap.tab.enrolment') };
}

/** After the seat: provisional admissions to follow up, students awaiting a register number, programme approvals. */
export default async function EnrolmentPage() {
  const me = await requireSection('admissions');
  const { t } = await getI18n();
  const [follow, awaiting, programmes] = await Promise.all([
    load(() => api<FollowUp[]>('/v1/admissions/provisional-follow-ups')),
    load(() => api<Awaiting[]>('/v1/admissions/awaiting-register-no')),
    load(() => api<ProgrammeSetting[]>('/v1/admissions/programme-settings')),
  ]);
  const err = follow.error ?? awaiting.error ?? programmes.error;
  return (
    <>
      <PageHeader title={t('ap.tab.enrolment')} subtitle={t('ap.enr.subtitle')} />
      <AdmissionsTabs current="enrolment" />
      {err !== undefined ? (
        <ErrorState message={err} />
      ) : (
        <div className="grid gap-6">
          <StatGrid>
            <StatTile label={t('ap.enr.dueSoon')} value={String(follow.data!.filter((f) => !f.overdue).length)} />
            <StatTile label={t('ap.enr.overdue')} value={String(follow.data!.filter((f) => f.overdue).length)} tone={follow.data!.some((f) => f.overdue) ? 'warning' : 'default'} />
            <StatTile label={t('ap.enr.awaiting')} value={String(awaiting.data!.length)} />
          </StatGrid>
          <Card title={t('ap.enr.follow')} subtitle={t('ap.enr.followHelp')}>
            <FollowUpsTable rows={follow.data!} />
          </Card>
          <Card title={t('ap.enr.awaitingTitle')} subtitle={t('ap.enr.awaitingHelp')}>
            <AwaitingTable rows={awaiting.data!} />
          </Card>
          <Card title={t('ap.enr.programmes')} subtitle={t('ap.enr.programmesHelp')}>
            <ProgrammeSettingsDesk rows={programmes.data!} canEdit={me?.roles.some((r) => r === 'principal' || r === 'tenant_admin') ?? false} />
          </Card>
        </div>
      )}
    </>
  );
}
