import type { Metadata } from 'next';
import { DpdpDesk } from '@/components/dpdp/DpdpDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { DpdpRow, GrievanceOfficer } from '@/lib/dpdp';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.dpdp') };
}

/** The queue of data-principal requests (correction and erasure) for the administrator, with the grievance officer's contact. */
export default async function DpdpPage() {
  await requireSection('dpdp');
  const { t } = await getI18n();
  const [rows, officer] = await Promise.all([load(() => api<DpdpRow[]>('/v1/dpdp/requests')), load(() => api<GrievanceOfficer>('/v1/dpdp/grievance-officer'))]);
  const failed = rows.error ?? officer.error;
  return (
    <>
      <PageHeader title={t('nav.dpdp')} subtitle={t('dp.subtitle')} />
      {failed !== undefined ? <ErrorState message={failed} /> : <DpdpDesk rows={rows.data!} officer={officer.data!.officer} nowIso={new Date().toISOString()} />}
    </>
  );
}
