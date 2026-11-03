import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { Card } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { schoolToday } from '@/lib/school';
import { REPORTS } from '@/lib/fee-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.reports') };
}

const GROUPS = ['collection', 'registers', 'books', 'statements'] as const;

/** Every accounts report, grouped: collection, registers, books of account and statements. */
export default async function DeskReportsPage() {
  await requireSection('finance');
  const { t } = await getI18n();
  const today = schoolToday();
  const fyStart = `${Number(today.slice(5, 7)) >= 4 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-04-01`;
  const accounts = await load(() => api<{ rows: { id: string; code: string; name: string }[] }>('/v1/records/fee-accounts?pageSize=100'));
  return (
    <>
      <PageHeader
        title={t('fd.reports')}
        subtitle={t('fd.reports.sub')}
        actions={
          <Button asChild variant="outline">
            <Link href="/accounts">{t('fd.back')}</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <Card key={g} title={t(`fd.grp.${g}` as MessageKey)}>
            <ul className="grid gap-2">
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <li key={r.key}>
                  <Link href={`/accounts/reports/${r.key}`} className="block rounded-lg border p-4 transition-colors hover:bg-muted">
                    <span className="block font-medium">{t(`fd.rep.${r.key}` as MessageKey)}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{t(`fd.rep.${r.key}.sub` as MessageKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <Card title={t('ff.export.title')} subtitle={t('ff.export.sub')}>
          <form action="/api/books-export" method="get" className="grid gap-3 sm:grid-cols-2" data-testid="zoho-export">
            <input type="hidden" name="format" value="zoho" />
            <label className="grid gap-1 text-sm">
              <span>{t('fd.f.from')}</span>
              <input className="h-9 rounded-md border bg-background px-2" type="date" name="from" defaultValue={fyStart} required />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t('fd.f.to')}</span>
              <input className="h-9 rounded-md border bg-background px-2" type="date" name="to" defaultValue={today} required />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>{t('fd.col.feeAccount')}</span>
              <select className="h-9 rounded-md border bg-background px-2" name="account" defaultValue="">
                <option value="">{t('ff.allAccounts')}</option>
                {(accounts.data?.rows ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit">{t('ff.export.zoho')}</Button>
              <Button asChild variant="outline">
                <a href="/api/books-export?format=tally">{t('ff.export.tally')}</a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/tally">{t('ff.export.tallyLive')}</Link>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
