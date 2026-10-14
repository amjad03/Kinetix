import type { Metadata } from 'next';
import Link from 'next/link';
import { FeeKitTable } from '@/components/fee-depth/FeeKitTable';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.nav.structures') };
}

/** Fee structures (by programme, batch, quota, category and semester): add, approve, publish, assign, import, export. */
export default async function StructuresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('fees');
  const sp = await searchParams;
  const { t } = await getI18n();
  // The heads are seeded on first use, so a new institution's structures can pick them at once.
  await load(() => api('/v1/fee-setup/heads'));
  const records = await loadRecords('fee-structures', sp);
  return (
    <>
      <PageHeader
        title={t('fd.nav.structures')}
        subtitle={t('fx.structuresSub')}
        actions={
          <Button asChild variant="outline" className="h-9">
            <Link href="/fees/setup">{t('fx.feeSetup')}</Link>
          </Button>
        }
      />
      <FeesNav value="structures" />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <FeeKitTable meta={records.data.meta} page={records.data.page} state={records.data.state} label={t('fd.nav.structures')} />}
    </>
  );
}
