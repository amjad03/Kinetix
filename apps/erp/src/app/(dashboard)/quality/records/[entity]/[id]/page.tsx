import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QualityRecord } from '@/components/quality-hub/QualityRecord';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isQhEntity, type QhRecord } from '@/lib/quality-hub';

type Params = Promise<{ entity: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { entity } = await params;
  const { t } = await getI18n();
  return { title: isQhEntity(entity) ? t(`qh.e.${entity}`) : t('nav.qhReports') };
}

/** One grievance, drive, proposal, survey, event, certificate... on the shared record page. */
export default async function QualityRecordPage({ params }: { params: Params }) {
  const { entity, id } = await params;
  if (!isQhEntity(entity) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireSection('qualityHub');
  const data = await load(() => api<QhRecord>(`/v1/quality-hub/records/${entity}/${id}`));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return <QualityRecord record={data.data} />;
}
