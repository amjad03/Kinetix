import type { Metadata } from 'next';
import { DeskSettings, type DeskSettingsData, type LateRule } from '@/components/fee-desk/DeskSettings';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.settings') };
}

/** Numbering series, payment modes, gateway and convenience fee, account mappings, approval chains, refund bands, dues blocks and reminders. */
export default async function DeskSettingsPage() {
  await requireSection('finance');
  const data = await load(async () => ({
    settings: await api<DeskSettingsData>('/v1/fee-accounts/settings'),
    rule: await api<LateRule | null>('/v1/fees/late-fee-rule'),
    accounts: await api<{ code: string; name: string; active: boolean }[]>('/v1/books/accounts'),
  }));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return <DeskSettings initial={data.data.settings} rule={data.data.rule} accounts={data.data.accounts.filter((a) => a.active)} />;
}
