import type { Metadata } from 'next';
import { SsoDesk, type Provider } from '@/components/gateway-books/SsoDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { API_URL } from '@/lib/config';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.sso') };
}

export default async function SsoPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const rows = await load(() => api<Provider[]>('/v1/admin/sso/providers'));
  return (
    <>
      <PageHeader title={t('nav.sso')} subtitle={t('gb.sso.subtitle')} />
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <SsoDesk providers={rows.data} callback={`${API_URL.replace(/\/$/, '')}/v1/auth/sso/callback`} />}
    </>
  );
}
