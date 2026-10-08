import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { HealthDesk } from '@/components/school-life/HealthDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { HealthChild, HealthVisit, SectionOption } from '@/lib/school-life';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.health') };
}

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ sectionId?: string }> }) {
  await requireSection('health');
  const sp = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => {
    const sections = await api<SectionOption[]>('/v1/student-health/sections');
    const sectionId = sections.find((s) => s.id === sp.sectionId)?.id ?? sections[0]?.id ?? '';
    const kids = sectionId ? await api<HealthChild[]>(`/v1/student-health/classes/${sectionId}/students`) : [];
    const visits = await api<HealthVisit[]>('/v1/student-health/visits');
    return { sections, sectionId, kids, visits };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.health')} subtitle={t('hl.subtitle')} />
      <HealthDesk {...data.data} />
    </>
  );
}
