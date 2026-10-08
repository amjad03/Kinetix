import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { EntranceDesk, type EntranceTestRow } from '@/components/admissions/EntranceDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { CycleRow } from '@/lib/admissions';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.entrance') };
}

export default async function EntrancePage() {
  await requireSection('admissions');
  const [tests, cycles] = await Promise.all([load(() => api<EntranceTestRow[]>('/v1/admissions/entrance-tests')), load(() => api<CycleRow[]>('/v1/admissions/cycles'))]);
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t('adm.tab.entrance')} subtitle={t('ent.subtitle')} />
      <AdmissionsTabs current="entrance" />
      {tests.error !== undefined ? <ErrorState message={tests.error} /> : <EntranceDesk tests={tests.data!} cycles={(cycles.data ?? []).map((c) => ({ id: c.id, name: `${c.name} (${c.programName})` }))} />}
    </>
  );
}
