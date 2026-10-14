import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StructureDetail } from '@/components/fee-depth/StructureDetail';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { FeeHead, PreviewRow, StructureDetail as Detail } from '@/lib/fee-depth';
import type { RecordMeta, Row } from '@/lib/records';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.one.structures') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One fee structure: heads and amounts, approval, who it applies to, assignment and re-assignment. */
export default async function StructurePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('fees');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(async () => {
    const [detail, heads, meta, row, preview] = await Promise.all([
      api<Detail>(`/v1/fee-setup/structures/${id}`),
      api<FeeHead[]>('/v1/fee-setup/heads'),
      api<RecordMeta>('/v1/records/fee-structures/meta'),
      api<Row>(`/v1/records/fee-structures/${id}`),
      api<PreviewRow[]>(`/v1/fee-setup/structures/${id}/preview`),
    ]);
    return { detail, heads, meta, row, preview };
  });
  return (
    <>
      <PageHeader
        title={data.data?.detail.structure.name ?? t('fd.one.structures')}
        subtitle={t('fx.structureSub')}
        actions={
          <Button asChild variant="outline" className="h-9">
            <Link href="/fees/structures">{t('fd.nav.structures')}</Link>
          </Button>
        }
      />
      {data.error !== undefined || !me ? <ErrorState message={data.error ?? ''} /> : <StructureDetail d={data.data.detail} heads={data.data.heads} meta={data.data.meta} row={data.data.row} preview={data.data.preview} me={{ id: me.id, roles: me.roles }} />}
    </>
  );
}
