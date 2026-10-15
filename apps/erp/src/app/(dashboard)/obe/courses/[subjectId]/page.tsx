import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { CourseWorkspace, type WorkspaceData } from '@/components/obe/CourseWorkspace';
import { ObeTabs } from '@/components/obe/ObeDepth';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import { YEAR_COOKIE } from '@/lib/config';
import { getI18n } from '@/i18n/server';
import type { CoSet, MatrixData, ObeStructure } from '@/lib/obe';
import type { CourseAssessment, CourseAttainment, ExitSurvey, PolicyView, Reviews, UnitPlan } from '@/lib/obe-flagship';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.ws.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Structure = ObeStructure & { sections: { id: string; name: string; programId: string; term: number; academicYearId: string }[] };

/** One course's OBE workspace. */
export default async function CourseWorkspacePage({ params, searchParams }: { params: Promise<{ subjectId: string }>; searchParams: Promise<{ academicYearId?: string; setId?: string }> }) {
  const me = await requireSection('obe');
  const { subjectId } = await params;
  if (!UUID.test(subjectId)) notFound();
  const q = await searchParams;
  const { t } = await getI18n();
  const structure = await load(() => api<Structure>('/v1/obe/structure'));
  if (structure.error !== undefined) return <ErrorState message={structure.error} />;
  const s = structure.data;
  const sub = s.subjects.find((x) => x.id === subjectId);
  if (!sub) notFound();
  const prog = s.programs.find((p) => p.id === sub.programId);
  const picked = (await cookies()).get(YEAR_COOKIE)?.value;
  const yearId = s.academicYears.find((y) => y.id === q.academicYearId)?.id ?? s.academicYears.find((y) => y.id === picked)?.id ?? s.academicYears.find((y) => y.isCurrent)?.id ?? s.academicYears[0]?.id ?? '';
  const sets = await load(() => api<CoSet[]>(`/v1/obe/subjects/${subjectId}/co-sets`));
  if (sets.error !== undefined) return <ErrorState message={sets.error} />;
  const set = sets.data.find((x) => x.id === q.setId) ?? sets.data.find((x) => x.status === 'draft') ?? sets.data.find((x) => x.status === 'active') ?? sets.data[0] ?? null;
  const [matrix, reviews, assessments, attainment, policy, surveys, plan] = await Promise.all([
    set ? safe(api<MatrixData>(`/v1/obe/co-sets/${set.id}/matrix`), null) : Promise.resolve(null),
    set ? safe(api<Reviews>(`/v1/obe/co-sets/${set.id}/reviews`), null) : Promise.resolve(null),
    yearId ? safe(api<CourseAssessment[]>(`/v1/obe/subjects/${subjectId}/assessments?academicYearId=${yearId}`), []) : Promise.resolve([]),
    yearId ? safe(api<CourseAttainment>(`/v1/obe/subjects/${subjectId}/attainment?academicYearId=${yearId}`), null) : Promise.resolve(null),
    safe(api<PolicyView>(`/v1/obe/policies?subjectId=${subjectId}${yearId ? `&academicYearId=${yearId}` : ''}`), null),
    safe(api<ExitSurvey[]>(`/v1/obe/programs/${sub.programId}/exit-surveys${yearId ? `?academicYearId=${yearId}` : ''}`), []),
    safe(api<UnitPlan>(`/v1/obe/subjects/${subjectId}/units`), null),
  ]);
  const d: WorkspaceData = {
    subject: { id: sub.id, code: sub.code, name: sub.name, term: sub.term, programId: sub.programId, program: prog?.name ?? '' },
    yearId,
    years: s.academicYears.map((y) => ({ id: y.id, label: y.label })),
    sets: sets.data,
    setId: set?.id ?? null,
    matrix,
    reviews,
    assessments: assessments ?? [],
    attainment,
    policy,
    surveys: surveys ?? [],
    plan,
    sections: s.sections.filter((x) => x.programId === sub.programId && x.term === sub.term && x.academicYearId === yearId).map((x) => ({ id: x.id, name: x.name })),
    leader: !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'quality_officer'),
  };
  return (
    <>
      <PageHeader
        title={`${sub.code} ${sub.name}`}
        subtitle={t('of.ws.sub', { programme: prog?.name ?? '', n: sub.term, year: s.academicYears.find((y) => y.id === yearId)?.label ?? '' })}
        actions={<LinkButton href="/obe/courses" variant="outlined">{t('of.ws.back')}</LinkButton>}
      />
      <ObeTabs value="courses" />
      <CourseWorkspace key={`${set?.id ?? 'none'}:${yearId}`} d={d} />
    </>
  );
}
