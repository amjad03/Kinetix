import type { Metadata } from 'next';
import { ClassroomTagger } from '@/components/obe/ClassroomTagger';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { CoSet } from '@/lib/obe';
import type { ClassroomActivity } from '@/lib/staff-changes';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('as.cls.title') };
}

export default async function ClassroomActivitiesPage({ searchParams }: { searchParams: Promise<{ subjectId?: string }> }) {
  await requireSection('obe');
  const q = await searchParams;
  const { t } = await getI18n();
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  const head = <PageHeader title={t('as.cls.title')} subtitle={t('as.cls.subtitle')} />;
  if (structure.error !== undefined) {
    return (
      <>
        {head}
        <ErrorState message={structure.error} />
      </>
    );
  }
  const subjects = structure.data.subjects;
  const subjectId = subjects.find((s) => s.id === q.subjectId)?.id ?? subjects[0]?.id ?? '';
  const data = subjectId
    ? await load(async () => {
        const [activities, sets] = await Promise.all([api<ClassroomActivity[]>(`/v1/obe/classroom-activities?subjectId=${subjectId}`), api<CoSet[]>(`/v1/obe/subjects/${subjectId}/co-sets`)]);
        const set = sets.find((s) => s.status === 'active') ?? sets[0];
        return { activities, cos: (set?.outcomes ?? []).map((c) => ({ id: c.id, code: c.code, statement: c.statement })) };
      })
    : null;
  return (
    <>
      {head}
      <UrlSelect label={t('as.cls.subject')} param="subjectId" value={subjectId} options={subjects.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))} />
      {data?.error !== undefined ? <ErrorState message={data.error} /> : data ? <ClassroomTagger activities={data.data.activities} cos={data.data.cos} /> : null}
    </>
  );
}
