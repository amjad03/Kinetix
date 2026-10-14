import type { Metadata } from 'next';
import { UserCheck } from 'lucide-react';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { NewCycleButton } from '@/components/admissions/CycleDialog';
import { KitList } from '@/components/admissions/KitList';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { schoolToday } from '@/lib/school';
import type { Structure } from '@/lib/types';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.cycles') };
}

/**
 * Admission cycles as a record kit list (seats, dates, fee, open or close in bulk, duplicate a cycle with its form,
 * the bin, export, history, saved views). A new cycle, with its form, documents and rules, starts from New cycle.
 */
export default async function CyclesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('admissions');
  const [loaded, structure] = await Promise.all([loadRecords('admission-cycles', await searchParams), load(() => api<Structure>('/v1/admin/structure'))]);
  const { t } = await getI18n();
  const status = Object.fromEntries(['draft', 'open', 'closed'].map((s) => [s, t(`adm.cycleStatus.${s}` as MessageKey)]));
  return (
    <>
      <PageHeader
        title={t('adm.tab.cycles')}
        subtitle={t('adm.cycles.subtitle')}
        actions={<NewCycleButton programs={structure.data?.programs ?? []} years={structure.data?.academicYears ?? []} today={schoolToday()} />}
      />
      <AdmissionsTabs current="cycles" />
      {loaded.error !== undefined ? (
        <ErrorState message={loaded.error} />
      ) : (
        <KitList
          meta={loaded.data.meta}
          page={loaded.data.page}
          state={loaded.data.state}
          label={t('adm.tab.cycles')}
          rowHref="/admissions/cycles/{id}"
          columns={[
            { key: 'name', header: t('adm.cycle'), sortKey: 'name', rowHeader: true, sub: 'programName' },
            { key: 'yearLabel', header: t('adk.col.year'), hideBelow: 'md' },
            { key: 'status', header: t('adm.col.status'), kind: 'pill', labels: status, tones: { open: 'success', draft: 'neutral', closed: 'neutral' } },
            { key: 'seats', header: t('adm.cycle.seats'), sortKey: 'seats', kind: 'number' },
            { key: 'held', header: t('adk.col.seatsTaken'), kind: 'number', hideBelow: 'sm' },
            { key: 'applications', header: t('adm.col.applications'), sortKey: 'applications', kind: 'number', hideBelow: 'md' },
            { key: 'feeRupees', header: t('adm.cycle.fee'), kind: 'rupees', hideBelow: 'lg' },
            { key: 'opensOn', header: t('adk.col.opens'), sortKey: 'opens', kind: 'date', defaultHidden: true },
            { key: 'closesOn', header: t('adm.cycle.closes'), sortKey: 'closes', kind: 'date', hideBelow: 'sm' },
          ]}
          empty={
            <EmptyState icon={<UserCheck />} title={t('adm.cycles.none')} testId="no-cycles">
              {t('adm.cycles.noneBody')}
            </EmptyState>
          }
        />
      )}
    </>
  );
}
