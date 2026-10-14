import type { Metadata } from 'next';
import { SsoDesk } from '@/components/gateway-books/SsoDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { API_URL } from '@/lib/config';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.sso') };
}

/** Single sign-on providers (Google Workspace, Microsoft Entra, any OpenID Connect provider). */
export default async function SsoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('settings');
  const { t } = await getI18n();
  const list = await loadRecords('sso-providers', await searchParams);
  return (
    <>
      <PageHeader title={t('nav.sso')} subtitle={t('gb.sso.subtitle')} />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <SsoDesk list={list.data} callback={`${API_URL.replace(/\/$/, '')}/v1/auth/sso/callback`} />}
    </>
  );
}
