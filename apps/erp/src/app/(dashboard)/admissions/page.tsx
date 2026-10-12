import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { EnquiryBoard } from '@/components/admissions/EnquiryBoard';
import { AdmissionsFlow, type FlowCycle, type QuotaView } from '@/components/admissions/AdmissionsFlow';
import { InsightCard } from '@/components/ai/InsightCard';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { ApplicationRow, Counsellor, CycleRow, Enquiry, MeritListDetail, MeritListSummary, Pipeline } from '@/lib/admissions';
import { schoolToday } from '@/lib/school';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

import { FileText, Plus } from 'lucide-react';

/** Each cycle with its latest merit list and seat-quota view, for the rank list. */
async function cycleRanks(cycles: CycleRow[]): Promise<FlowCycle[]> {
  const ordered = [...cycles].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)).slice(0, 8);
  return Promise.all(
    ordered.map(async (c) => {
      const [lists, quota] = await Promise.all([load(() => api<MeritListSummary[]>(`/v1/admissions/cycles/${c.id}/merit-lists`)), load(() => api<QuotaView>(`/v1/admissions/cycles/${c.id}/quotas`))]);
      const latest = lists.data?.[0];
      const merit = latest ? await load(() => api<MeritListDetail>(`/v1/admissions/merit-lists/${latest.id}`)) : null;
      return { id: c.id, name: c.name, status: c.status, seats: c.seats, merit: merit?.data ?? null, quota: quota.data ?? null };
    }),
  );
}
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.admissions') };
}

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const me = await requireSection('admissions');
  const sp = await searchParams;
  const mine = sp.mine === '1' ? '?mine=1' : '';
  const { t } = await getI18n();
  const [enquiries, pipeline, counsellors, structure, apps, cycles] = await Promise.all([
    load(() => api<Enquiry[]>(`/v1/admissions/enquiries${mine}`)),
    load(() => api<Pipeline>(`/v1/admissions/pipeline${mine}`)),
    load(() => api<Counsellor[]>('/v1/admissions/counsellors')),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<ApplicationRow[]>('/v1/admissions/applications')),
    load(() => api<CycleRow[]>('/v1/admissions/cycles')),
  ]);
  const ranks = await cycleRanks(cycles.data ?? []);
  const error = enquiries.error ?? pipeline.error;
  void me;
  return (
    <>
      <PageHeader
        title={t('nav.admissions')}
        subtitle={t('axr.adm.subtitle')}
        actions={
          <>
            <LinkButton href="/admissions/applications" variant="outlined" startIcon={<FileText />}>
              {t('adm.tab.applications')}
            </LinkButton>
            <LinkButton href="/admissions/cycles" variant="contained" startIcon={<Plus />}>
              {t('adm.tab.cycles')}
            </LinkButton>
          </>
        }
      />
      <AdmissionsTabs current="pipeline" />
      <InsightCard kind="admissions" />
      {error !== undefined ? (
        <ErrorState message={error} />
      ) : (
        <AdmissionsFlow
          enquiryTotal={Object.values(pipeline.data!.stages).reduce((n, c) => n + c, 0)}
          enquiries={enquiries.data!.filter((e) => !['converted', 'lost'].includes(e.stage)).slice(0, 4).map((e) => ({ id: e.id, name: e.name, programName: e.programName, source: e.source }))}
          apps={apps.data ?? []}
          cycles={ranks}
          enquiryBoard={<EnquiryBoard enquiries={enquiries.data!} counsellors={counsellors.data ?? []} programs={structure.data?.programs.map((p) => ({ id: p.id, name: p.name })) ?? []} today={schoolToday()} />}
        />
      )}
    </>
  );
}
