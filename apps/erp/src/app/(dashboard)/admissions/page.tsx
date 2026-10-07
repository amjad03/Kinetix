import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { EnquiryBoard } from '@/components/admissions/EnquiryBoard';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { Counsellor, Enquiry, Pipeline } from '@/lib/admissions';
import { schoolToday } from '@/lib/school';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.admissions') };
}

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const me = await requireSection('admissions');
  const sp = await searchParams;
  const mine = sp.mine === '1' ? '?mine=1' : '';
  const { t } = await getI18n();
  const [enquiries, pipeline, counsellors, structure] = await Promise.all([
    load(() => api<Enquiry[]>(`/v1/admissions/enquiries${mine}`)),
    load(() => api<Pipeline>(`/v1/admissions/pipeline${mine}`)),
    load(() => api<Counsellor[]>('/v1/admissions/counsellors')),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const error = enquiries.error ?? pipeline.error;
  void me;
  return (
    <>
      <PageHeader title={t('nav.admissions')} subtitle={t('adm.subtitle')} />
      <AdmissionsTabs current="pipeline" />
      {error !== undefined ? (
        <ErrorState message={error} />
      ) : (
        <>
          <StatGrid>
            <StatTile icon={<HowToRegOutlined />} label={t('adm.pipeline.open')} value={String(Object.entries(pipeline.data!.stages).filter(([s]) => !['converted', 'lost'].includes(s)).reduce((n, [, c]) => n + c, 0))} />
            <StatTile label={t('adm.pipeline.dueToday')} value={String(pipeline.data!.followUpsDue)} />
            <StatTile label={t('adm.pipeline.thisWeek')} value={String(pipeline.data!.newThisWeek)} />
            <StatTile label={t('adm.pipeline.converted')} value={String(pipeline.data!.stages.converted ?? 0)} />
          </StatGrid>
          <EnquiryBoard enquiries={enquiries.data!} counsellors={counsellors.data ?? []} programs={structure.data?.programs.map((p) => ({ id: p.id, name: p.name })) ?? []} today={schoolToday()} />
        </>
      )}
    </>
  );
}
