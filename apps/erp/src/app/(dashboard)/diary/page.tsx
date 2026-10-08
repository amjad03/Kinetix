import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { DiaryDesk } from '@/components/school-life/DiaryDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { DiaryEntry } from '@/lib/school-life';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.diary') };
}

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ sectionId?: string }> }) {
  await requireSection('diary');
  const sp = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => {
    const sections = (await api<Structure>('/v1/admin/structure')).sections;
    const sectionId = sections.find((s) => s.id === sp.sectionId)?.id ?? sections[0]?.id ?? '';
    const entries = sectionId ? await api<DiaryEntry[]>(`/v1/diary?sectionId=${sectionId}`) : [];
    return { sections, sectionId, entries };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.diary')} subtitle={t('dy.subtitle')} />
      <DiaryDesk sections={data.data.sections.map((s) => ({ id: s.id, displayName: s.displayName }))} sectionId={data.data.sectionId} entries={data.data.entries} />
    </>
  );
}
