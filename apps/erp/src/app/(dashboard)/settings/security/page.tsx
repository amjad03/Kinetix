import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { SecurityAdmin } from '@/components/settings/SecurityAdmin';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { FeatureFlag } from '@/lib/insights';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('security.features') };
}

/** Settings › Features and security: feature toggles and which roles must sign in with two steps. */
export default async function SecuritySettingsPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<FeatureFlag[]>('/v1/admin/features'), api<{ mfaRequiredRoles: string[]; assignableRoles: string[] }>('/v1/admin/security-policy')]));
  return (
    <>
      <PageHeader title={t('security.features')} subtitle={t('security.features.lead')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <SecurityAdmin features={data.data[0]} requiredRoles={data.data[1].mfaRequiredRoles} assignableRoles={data.data[1].assignableRoles} />}
    </>
  );
}
