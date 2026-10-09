import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { SchoolModeDesk } from '@/components/school-mode/SchoolModeDesk';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { HouseRow, OutcomeRow, PucStream } from '@/lib/curriculum';
import { getI18n } from '@/i18n/server';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.schoolMode') };
}

/** School mode: houses, PUC streams and combinations, learning outcomes and report cards. */
export default async function SchoolModePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('schoolMode');
  const { t } = await getI18n();
  const { tab } = await searchParams;
  const [houses, streams, outcomes, structure] = await Promise.all([
    load(() => api<HouseRow[]>('/v1/houses/leaderboard')),
    load(() => api<PucStream[]>('/v1/school/puc/streams')),
    load(() => api<OutcomeRow[]>('/v1/school/outcomes')),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const failed = houses.error ?? streams.error ?? outcomes.error ?? structure.error;
  return (
    <>
      <PageHeader title={t('nav.schoolMode')} subtitle={t('sm.subtitle')} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <SchoolModeDesk houses={houses.data!} streams={streams.data!} outcomes={outcomes.data!} years={structure.data!.academicYears.map((y) => ({ id: y.id, label: y.label }))} tab={tab ?? 'houses'} canAdmin={!!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin')} />
      )}
    </>
  );
}
