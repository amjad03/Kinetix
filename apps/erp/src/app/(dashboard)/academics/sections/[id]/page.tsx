import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionRecordView } from '@/components/academics/Records';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { SectionRecord } from '@/lib/academics';
import { ApiError, api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acad.tab.classes') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('academics');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const res = await load(async () => {
    try {
      return await api<SectionRecord>(`/v1/academics/sections/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  return <SectionRecordView s={res.data} />;
}
