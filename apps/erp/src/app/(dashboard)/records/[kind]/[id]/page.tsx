import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RecordView } from '@/components/campus-ops/RecordView';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isRecordKind, type OpsRecord } from '@/lib/campus-ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cops.overview') };
}

/** Any admissions or campus-operations record (application, out-pass, purchase order, asset…) on the RecordPage template. */
export default async function RecordRoute({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requireSection('campusOps');
  const { kind, id } = await params;
  if (!isRecordKind(kind) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const rec = await load(() => api<OpsRecord>(`/v1/ops-records/${kind}/${id}`));
  if (!rec.data) return <ErrorState message={rec.error ?? ''} />;
  return <RecordView data={rec.data} />;
}
