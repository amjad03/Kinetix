import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CloseDay } from '@/components/fee-desk/CloseDay';
import { NewStructure } from '@/components/fee-desk/NewStructure';
import { NewVoucher } from '@/components/fee-desk/NewVoucher';
import { SpecTable } from '@/components/fee-desk/SpecTable';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { isEntity, LISTS, type Row } from '@/lib/fee-desk';

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }): Promise<Metadata> {
  const { entity } = await params;
  return { title: (await getI18n()).t(`fd.nav.${entity}` as MessageKey) };
}

/** A desk list: status tabs in the URL, the table, and how to add a new one where the desk creates them. */
export default async function DeskListPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<{ status?: string }> }) {
  await requireSection('finance');
  const { entity } = await params;
  if (!isEntity(entity)) notFound();
  const { status } = await searchParams;
  const { t } = await getI18n();
  const spec = LISTS[entity];
  const st = spec.statuses?.includes(status ?? '') ? status : undefined;
  const data = await load(async () => ({
    rows: await api<Row[]>(`/v1/fee-accounts/list/${entity}${st ? `?status=${st}` : ''}`),
    accounts: entity === 'voucher-requests' ? await api<{ id: string; code: string; name: string; active: boolean }[]>('/v1/books/accounts') : [],
    periods: entity === 'closings' ? await api<{ period: string; closedAt: string }[]>('/v1/fee-accounts/periods') : [],
  }));
  const title = t(`fd.nav.${entity}` as MessageKey);
  const link = (href: string, label: string) => (
    <Button asChild variant="outline" className="h-10">
      <Link href={href}>{label}</Link>
    </Button>
  );
  const actions = {
    structures: <NewStructure />,
    'voucher-requests': <NewVoucher accounts={(data.data?.accounts ?? []).filter((a) => a.active)} />,
    budgets: link('/budgets', t('fd.a.setBudgets')),
    ledgers: link('/books', t('fd.a.chart')),
    vouchers: link('/accounts/voucher-requests', t('fd.nav.voucher-requests')),
  } as Partial<Record<string, React.ReactNode>>;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={t(`fd.sub.${entity}` as MessageKey)}
        actions={
          <>
            {link('/accounts', t('fd.back'))}
            {actions[entity]}
          </>
        }
      />
      {spec.statuses && (
        <LinkTabs
          label={title}
          value={st ?? 'all'}
          items={[{ value: 'all', label: t('fd.all'), href: `/accounts/${entity}` }, ...spec.statuses.map((s) => ({ value: s, label: t(`fd.st.${s}` as MessageKey), href: `/accounts/${entity}?status=${s}` }))]}
        />
      )}
      {entity === 'closings' && <CloseDay periods={data.data?.periods ?? []} />}
      {data.error !== undefined ? <ErrorState message={data.error} /> : <SpecTable columns={spec.columns} rows={data.data.rows} label={title} href={`/accounts/${entity}/{id}`} exportName={entity} empty={t('fd.empty')} />}
    </>
  );
}
