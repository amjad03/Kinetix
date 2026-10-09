import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UniversityDesk } from '@/components/university/UniversityDesk';
import { api, load, requireSection } from '@/lib/api';
import type { ConvocationRow, InstitutionRow } from '@/lib/curriculum';
import { getI18n } from '@/i18n/server';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.university') };
}

/** Affiliated institutions and convocations. */
export default async function UniversityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('university');
  const { t } = await getI18n();
  const { tab } = await searchParams;
  const [institutions, convocations, structure] = await Promise.all([
    load(() => api<InstitutionRow[]>('/v1/university/institutions')),
    load(() => api<ConvocationRow[]>('/v1/university/convocations')),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const failed = institutions.error ?? convocations.error ?? structure.error;
  return (
    <>
      <PageHeader title={t('nav.university')} subtitle={t('un.subtitle')} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <UniversityDesk institutions={institutions.data!} convocations={convocations.data!} programs={structure.data!.programs.map((p) => ({ id: p.id, name: p.name }))} tab={tab ?? 'convocations'} canAdmin={!!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'exam_controller')} />
      )}
    </>
  );
}
