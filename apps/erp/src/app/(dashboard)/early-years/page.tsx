import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { EarlyYearsDesk } from '@/components/school-life/EarlyYearsDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { EyChild, EyTerm } from '@/lib/school-life';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.earlyYears') };
}

export default async function EarlyYearsPage({ searchParams }: { searchParams: Promise<{ sectionId?: string }> }) {
  const me = await requireSection('earlyYears');
  const sp = await searchParams;
  const { t } = await getI18n();
  const canSeed = (me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin');
  const data = await load(async () => {
    const structure = await api<Structure>('/v1/admin/structure');
    // School classes only when the institution has any; Nursery to UKG are school classes.
    const school = new Set(structure.programs.filter((p) => p.level === 'k12').map((p) => p.id));
    const sections = structure.sections.filter((s) => school.size === 0 || school.has(s.programId));
    const sectionId = sections.find((s) => s.id === sp.sectionId)?.id ?? sections[0]?.id ?? '';
    const [children, terms, framework] = await Promise.all([
      sectionId ? api<EyChild[]>(`/v1/early-years/classes/${sectionId}/students`) : Promise.resolve([]),
      api<EyTerm[]>('/v1/early-years/terms'),
      api<unknown[]>('/v1/early-years/framework'),
    ]);
    return { sections, sectionId, children, terms, milestoneCount: framework.length };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const d = data.data;
  return (
    <>
      <PageHeader title={t('nav.earlyYears')} subtitle={t('ey.subtitle')} />
      <EarlyYearsDesk sections={d.sections.map((s) => ({ id: s.id, displayName: s.displayName }))} sectionId={d.sectionId} kids={d.children} terms={d.terms} canSeed={canSeed} milestoneCount={d.milestoneCount} />
    </>
  );
}
