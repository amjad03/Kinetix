import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AssetView, type AssetFull } from '@/components/assets/AssetView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { metaOptions } from '@/lib/procurement-server';
import type { RecordMeta } from '@/lib/records';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.assets') };
}

/** One asset of the register. */
export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('assets');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await load(async () => {
    const [a, meta] = await Promise.all([api<AssetFull>(`/v1/assets/${id}`), api<RecordMeta>('/v1/records/assets/meta')]);
    return { a, meta };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { a, meta } = data.data;
  return <AssetView a={a} rooms={metaOptions(meta, 'roomId')} departments={metaOptions(meta, 'departmentId')} canEdit={meta.can.write} />;
}
