import type { Metadata } from 'next';
import { CareersDesk } from '@/components/careers/CareersDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { AptitudeTest, CareerPath, ResumeRow } from '@/lib/pathways-a';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.careers') };
}

/** Roles that write tests and career paths (a head of department only reads). */
const CAREER_STAFF = ['principal', 'tenant_admin', 'placement_officer'];

/** The career lab: shared resumes, aptitude tests with their results, and career paths. */
export default async function CareersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('careers');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const [resumes, tests, paths] = await Promise.all([
    load(() => api<ResumeRow[]>('/v1/careers/resumes')),
    load(() => api<AptitudeTest[]>('/v1/careers/tests')),
    load(() => api<CareerPath[]>('/v1/careers/paths')),
  ]);
  const failed = resumes.error ?? tests.error ?? paths.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  const canEdit = (me?.roles ?? []).some((r) => CAREER_STAFF.includes(r));
  return (
    <>
      <PageHeader title={t('nav.careers')} subtitle={t('crr.subtitle')} />
      <CareersDesk resumes={resumes.data!} tests={tests.data!} paths={paths.data!} canEdit={canEdit} initialTab={tab ?? 'resumes'} />
    </>
  );
}
