import type { Metadata } from 'next';
import { DataExports } from '@/components/access/DataExports';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { DataExport } from '@/lib/governance-access';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ga.export.title') };
}

/** Settings > Backups and export: a full download of the institution's data (every table, secrets left out). */
export default async function DataExportPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const rows = await load(() => api<DataExport[]>('/v1/admin/data-exports'));
  return (
    <>
      <PageHeader
        title={t('ga.export.title')}
        subtitle={t('ga.export.sub')}
        actions={
          <LinkButton href="/governance/retention" variant="outlined">
            {t('nav.govRetention')}
          </LinkButton>
        }
      />
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <DataExports rows={rows.data} />}
    </>
  );
}
