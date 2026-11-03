import type { Metadata } from 'next';
import { GatewayAccounts } from '@/components/fee-flagship/GatewayAccounts';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { API_URL } from '@/lib/config';
import type { GatewayAccount } from '@/lib/gateways';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ff.gw.title') };
}

/** Online payments: the institution's gateway and each fee account's own (principal and administrator only). */
export default async function GatewaysPage() {
  await requireSection('fees');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [gw, accounts] = await Promise.all([api<{ serverMode: string; accounts: GatewayAccount[] }>('/v1/admin/payments/gateways'), api<{ rows: { id: string; code: string; name: string }[] }>('/v1/records/fee-accounts?pageSize=100')]);
    return { ...gw, feeAccounts: accounts.rows };
  });
  return (
    <>
      <PageHeader title={t('ff.gw.title')} subtitle={t('ff.gw.subtitle')} />
      <FeesNav value="gateways" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <GatewayAccounts accounts={data.data.accounts} feeAccounts={data.data.feeAccounts} apiUrl={API_URL} serverMode={data.data.serverMode} />}
    </>
  );
}
