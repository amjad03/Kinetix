import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { SeatPlanDesk } from '@/components/admissions/SeatPlanDesk';
import { Bar } from '@/components/ops/kit';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import type { EligibilityOptions, Matrix, PassCatalog } from '@/lib/admissions-pass';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ap.tab.seats') };
}

interface Cycle { id: string; name: string; seats: number; status: string }

/** The reservation matrix of a cycle: seat types × categories with horizontal and supernumerary seats. */
export default async function SeatsPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const me = await requireSection('admissions');
  const { cycle } = await searchParams;
  const { t } = await getI18n();
  const [cycles, catalog] = await Promise.all([load(() => api<Cycle[]>('/v1/admissions/cycles')), load(() => api<PassCatalog>('/v1/admissions/pass/catalog'))]);
  const err = cycles.error ?? catalog.error;
  const picked = cycles.data?.find((c) => c.id === cycle) ?? cycles.data?.find((c) => c.status === 'open') ?? cycles.data?.[0];
  const [matrix, eligibility] = picked ? await Promise.all([load(() => api<Matrix>(`/v1/admissions/cycles/${picked.id}/reservation`)), load(() => api<EligibilityOptions>(`/v1/admissions/cycles/${picked.id}/profile-eligibility`))]) : [null, null];
  const inner = matrix?.error ?? eligibility?.error;
  return (
    <>
      <PageHeader title={t('ap.tab.seats')} subtitle={t('ap.seat.subtitle')} />
      <AdmissionsTabs current="seats" />
      {err !== undefined ? (
        <ErrorState message={err} />
      ) : !picked ? (
        <EmptyState title={t('ap.seat.noCycles')} description={t('ap.seat.noCyclesHelp')} />
      ) : (
        <>
          <Bar>
            <UrlSelect label={t('ap.cycle')} param="cycle" value={picked.id} options={cycles.data!.map((c) => ({ value: c.id, label: c.name }))} minWidth={320} testId="cycle-pick" />
          </Bar>
          {inner !== undefined ? <ErrorState message={inner} /> : <SeatPlanDesk key={picked.id} cycleId={picked.id} cycleSeats={picked.seats} catalog={catalog.data!} matrix={matrix!.data!} eligibility={eligibility!.data!} canDereserve={me?.roles.some((r) => r === 'principal' || r === 'tenant_admin') ?? false} />}
        </>
      )}
    </>
  );
}
