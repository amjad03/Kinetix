import type { Metadata } from 'next';
import Link from 'next/link';
import { BankReco } from '@/components/fee-depth/BankReco';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { BankAccount, BankLine, Brs } from '@/lib/fee-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fx.bankReco') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['unmatched', 'matched', 'ignored', 'all', 'brs'];

/** Bank reconciliation: statements, matching and the reconciliation statement for one bank ledger (?account=). */
export default async function BankRecoPage({ searchParams }: { searchParams: Promise<{ account?: string; status?: string }> }) {
  await requireSection('finance');
  const sp = await searchParams;
  const { t } = await getI18n();
  const status = STATUSES.includes(sp.status ?? '') ? sp.status! : 'unmatched';
  const data = await load(async () => {
    const accounts = await api<BankAccount[]>('/v1/accounts-depth/bank-accounts');
    const asked = sp.account && UUID.test(sp.account) ? sp.account : null;
    const account = accounts.find((a) => a.id === asked) ?? accounts.find((a) => a.unmatched > 0) ?? accounts.find((a) => a.code === '1010') ?? accounts[0] ?? null;
    if (!account) return { accounts, account: null, lines: [], brs: null, settlements: [] };
    const [lines, brs, settlements] = await Promise.all([
      status === 'brs' ? Promise.resolve([] as BankLine[]) : api<BankLine[]>(`/v1/accounts-depth/bank/lines?accountId=${account.id}${status === 'all' ? '' : `&status=${status}`}`),
      api<Brs>(`/v1/accounts-depth/bank/reconciliation?accountId=${account.id}`),
      api<{ id: string; provider: string; reference: string; settlementDate: string; netPaise: number; bankLineId: string | null }[]>('/v1/accounts-depth/settlements/bank-status'),
    ]);
    return { accounts, account, lines, brs, settlements };
  });
  return (
    <>
      <PageHeader
        title={t('fx.bankReco')}
        subtitle={t('fx.bankRecoSub')}
        actions={
          <>
            <Button asChild variant="outline" className="h-9">
              <Link href="/accounts/ledgers?f.cashBank=yes">{t('fx.bankLedgers')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/settlements">{t('nav.settlements')}</Link>
            </Button>
          </>
        }
      />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <BankReco accounts={data.data.accounts} account={data.data.account} lines={data.data.lines} status={status} brs={data.data.brs} settlements={data.data.settlements} />}
    </>
  );
}
