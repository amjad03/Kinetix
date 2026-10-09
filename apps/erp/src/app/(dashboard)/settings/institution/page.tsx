import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { InstitutionAdmin } from '@/components/settings/InstitutionAdmin';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { AttendanceRules, InstitutionProfile } from '@/lib/institution';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.institution') };
}

/** Settings > Institution profile. */
export default async function InstitutionPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<InstitutionProfile>('/v1/admin/institution/profile'), api<AttendanceRules>('/v1/admin/settings')]));
  return (
    <>
      <PageHeader title={t('nav.institution')} subtitle={t('inst.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <InstitutionAdmin initial={data.data[0]} rules={data.data[1]} />}
    </>
  );
}
