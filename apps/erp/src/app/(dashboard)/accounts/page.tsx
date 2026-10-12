import type { Metadata } from 'next';
import Link from 'next/link';
import { SpecTable } from '@/components/fee-desk/SpecTable';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { Card, StatGrid, StatTile } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { ENTITIES, type ColSpec, type Row } from '@/lib/fee-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.accountsDesk') };
}

interface Inbox {
  items: Row[];
  counts: Record<string, number>;
  kpis: { todayPaise: number; duePaise: number; overduePaise: number; defaulters: number };
}

const INBOX: ColSpec[] = [
  { key: 'entity', label: 'fd.col.kind', kind: 'status' },
  { key: 'number', label: 'fd.col.number' },
  { key: 'title', label: 'fd.col.particulars', hideBelow: 'md' },
  { key: 'step', label: 'fd.col.step', kind: 'status' },
  { key: 'amount', label: 'fd.col.amount', kind: 'money' },
  { key: 'at', label: 'fd.col.date', kind: 'date', hideBelow: 'sm' },
];

/** The accounts desk: today's numbers, everything waiting for a decision or a next step, and the way into every register. */
export default async function AccountsDeskPage() {
  await requireSection('finance');
  const { t, fmt } = await getI18n();
  const data = await load(() => api<Inbox>('/v1/fee-accounts/inbox'));
  const link = (href: string, label: string, variant: 'outline' | 'default' = 'outline') => (
    <Button asChild variant={variant} className="h-10">
      <Link href={href}>{label}</Link>
    </Button>
  );
  return (
    <>
      <PageHeader
        title={t('nav.accountsDesk')}
        subtitle={t('fd.hub.subtitle')}
        actions={
          <>
            {link('/accounts/settings', t('fd.settings'))}
            {link('/accounts/reports', t('fd.reports'), 'default')}
          </>
        }
      />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <div className="grid gap-6">
          <StatGrid min={200}>
            <StatTile label={t('fd.kpi.today')} value={fmt.rupees(data.data.kpis.todayPaise)} href="/accounts/reports/daily-collection" />
            <StatTile label={t('fd.kpi.due')} value={fmt.rupeesShort(data.data.kpis.duePaise)} href="/accounts/accounts?status=due" />
            <StatTile label={t('fd.kpi.overdue')} value={fmt.rupeesShort(data.data.kpis.overduePaise)} tone={data.data.kpis.overduePaise > 0 ? 'warning' : 'default'} href="/accounts/reports/outstanding" />
            <StatTile label={t('fd.kpi.defaulters')} value={data.data.kpis.defaulters} href="/accounts/reports/outstanding" />
          </StatGrid>
          <Card title={t('fd.inbox')} subtitle={t('fd.inbox.sub', { n: data.data.items.length })}>
            <SpecTable columns={INBOX} rows={data.data.items} href="/accounts/{entity}/{id}" label={t('fd.inbox')} empty={t('fd.inbox.empty')} />
          </Card>
          <Card title={t('fd.registers')}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ENTITIES.map((e) => (
                <li key={e}>
                  <Link href={`/accounts/${e}`} className="flex h-full items-start justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted">
                    <span className="min-w-0">
                      <span className="block font-medium">{t(`fd.nav.${e}` as MessageKey)}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{t(`fd.sub.${e}` as MessageKey)}</span>
                    </span>
                    {data.data.counts[e] ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{data.data.counts[e]}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
