import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { BrandingAdmin } from '@/components/settings/BrandingAdmin';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Branding } from '@/lib/doc-designs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.branding') };
}

/** Settings > Institution > Branding: logos, seal, signatures, palette and fonts for every document. */
export default async function BrandingPage() {
  const me = await requireSection('settings');
  const { t } = await getI18n();
  const data = await load(() => api<Branding>('/v1/admin/branding'));
  return (
    <>
      <PageHeader title={t('nav.branding')} subtitle={t('br.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <BrandingAdmin initial={data.data} canEdit={!!me && me.roles.some((r) => r === 'tenant_admin' || r === 'principal')} institution={me?.tenant.name ?? ''} />}
    </>
  );
}
