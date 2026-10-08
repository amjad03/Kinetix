import type { Metadata } from 'next';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import { CyclesTable } from '@/components/admissions/AdmissionsTables';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { NewCycleButton } from '@/components/admissions/CycleDialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { CycleRow } from '@/lib/admissions';
import { schoolToday } from '@/lib/school';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.cycles') };
}

export default async function CyclesPage() {
  await requireSection('admissions');
  const [cycles, structure] = await Promise.all([load(() => api<CycleRow[]>('/v1/admissions/cycles')), load(() => api<Structure>('/v1/admin/structure'))]);
  const { t } = await getI18n();
  return (
    <>
      <PageHeader
        title={t('adm.tab.cycles')}
        subtitle={t('adm.cycles.subtitle')}
        actions={<NewCycleButton programs={structure.data?.programs ?? []} years={structure.data?.academicYears ?? []} today={schoolToday()} />}
      />
      <AdmissionsTabs current="cycles" />
      {cycles.error !== undefined ? (
        <ErrorState message={cycles.error} />
      ) : cycles.data!.length === 0 ? (
        <EmptyState icon={<HowToRegOutlined />} title={t('adm.cycles.none')} testId="no-cycles">
          {t('adm.cycles.noneBody')}
        </EmptyState>
      ) : (
        <CyclesTable rows={cycles.data!} />
      )}
    </>
  );
}
