import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeacherRecordView } from '@/components/academics/Records';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { TeacherRecord } from '@/lib/academics';
import { ApiError, api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acad.tab.teachers') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('academics');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const res = await load(async () => {
    try {
      return await api<TeacherRecord>(`/v1/academics/teachers/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  return <TeacherRecordView x={res.data} />;
}
