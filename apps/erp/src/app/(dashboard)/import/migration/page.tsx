import type { Metadata } from 'next';
import { Batch, MigrationDesk, SavedMapping } from '@/components/import/MigrationDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.migration') };
}

/** Data migration from Linways-style and Excel exports, for the principal and admin office. */
export default async function MigrationPage() {
  await requireSection('import');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [mappings, batches] = await Promise.all([api<SavedMapping[]>('/v1/admin/data-migration/mappings'), api<Batch[]>('/v1/admin/data-migration/batches')]);
    return { mappings, batches };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.migration')} subtitle={t('uni.mig.subtitle')} />
      <MigrationDesk mappings={data.data.mappings} batches={data.data.batches} />
    </>
  );
}
