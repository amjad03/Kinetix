import type { Metadata } from 'next';
import { AcademicsHub } from '@/components/academics/AcademicsHub';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { AcademicRequest, Directory, LessonPlanRow } from '@/lib/academics';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acad.title') };
}

type Handover = { id: string; fullName: string; rollNo: string; section: string; sectionId: string; enrolledOn: string | null };

export default async function AcademicsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireSection('academics');
  const q = await searchParams;
  const res = await load(async () => {
    const [requests, directory, plans, handover] = await Promise.all([
      api<AcademicRequest[]>('/v1/academics/requests'),
      api<Directory>('/v1/academics/directory'),
      api<LessonPlanRow[]>('/v1/academics/lesson-plans'),
      api<Handover[]>('/v1/academics/handover/pending'),
    ]);
    return { requests, directory, plans, handover };
  });
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  const roles = me?.roles ?? [];
  return (
    <AcademicsHub
      {...res.data}
      canAdmin={roles.some((r) => r === 'principal' || r === 'tenant_admin')}
      canReviewPlans={roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod')}
      initial={{ tab: q.tab, kind: q.new, studentId: q.student, sectionId: q.section }}
    />
  );
}
