import type { Metadata } from 'next';
import { DeskSettings, type DeskSettingsData, type LateRule } from '@/components/fee-desk/DeskSettings';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.settings') };
}

/** Numbering series, fee heads, late fees, payment modes, gateway, account mappings and approval limits. */
export default async function DeskSettingsPage() {
  const me = await requireSection('finance');
  const data = await load(async () => ({
    settings: await api<DeskSettingsData>('/v1/fee-accounts/settings'),
    rule: await api<LateRule | null>('/v1/fees/late-fee-rule'),
    accounts: await api<{ code: string; name: string; active: boolean }[]>('/v1/books/accounts'),
  }));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const canEditRule = !!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  return <DeskSettings initial={data.data.settings} rule={data.data.rule} accounts={data.data.accounts.filter((a) => a.active)} canEditRule={canEditRule} />;
}
