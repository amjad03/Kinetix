import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CloseDay } from '@/components/fee-desk/CloseDay';
import { NewVoucher } from '@/components/fee-desk/NewVoucher';
import { SpecTable } from '@/components/fee-desk/SpecTable';
import { FeeKitTable } from '@/components/fee-depth/FeeKitTable';
import { NewChallan, ReconcileChallans } from '@/components/fee-depth/ChallanActions';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { isEntity, LISTS, type Row } from '@/lib/fee-desk';
import { KIT_OF } from '@/lib/fee-depth';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }): Promise<Metadata> {
  const { entity } = await params;
  return { title: (await getI18n()).t(`fd.nav.${entity}` as MessageKey) };
}

/**
 * A desk register. Every list but the student fee accounts summary is a record-kit list (search, filters, sort,
 * bulk actions, import, export, history, the recycle bin, saved views); the desk adds what creates its records.
 */
export default async function DeskListPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('finance');
  const { entity } = await params;
  if (!isEntity(entity)) notFound();
  const sp = await searchParams;
  const { t } = await getI18n();
  const title = t(`fd.nav.${entity}` as MessageKey);
  const kit = KIT_OF[entity];
  const extra = await load(async () => ({
    accounts: entity === 'voucher-requests' ? await api<{ id: string; code: string; name: string; active: boolean }[]>('/v1/books/accounts') : [],
    funds: entity === 'voucher-requests' ? await api<{ id: string; code: string; name: string }[]>('/v1/accounts-depth/funds') : [],
    departments: entity === 'voucher-requests' ? await api<{ id: string; name: string }[]>('/v1/admin/departments').catch(() => []) : [],
    periods: entity === 'closings' ? await api<{ period: string; closedAt: string }[]>('/v1/fee-accounts/periods') : [],
  }));
  const link = (href: string, label: string) => (
    <Button asChild variant="outline" className="h-9">
      <Link href={href}>{label}</Link>
    </Button>
  );
  const actions = {
    structures: link('/fees/setup', t('fx.feeSetup')),
    'voucher-requests': <NewVoucher accounts={(extra.data?.accounts ?? []).filter((a) => a.active)} funds={extra.data?.funds ?? []} departments={extra.data?.departments ?? []} />,
    budgets: link('/accounts/reports/budget-vs-actual', t('fd.rep.budget-vs-actual')),
    ledgers: link('/accounts/bank', t('fx.bankReco')),
    vouchers: link('/accounts/voucher-requests', t('fd.nav.voucher-requests')),
    challans: (
      <>
        <ReconcileChallans />
        <NewChallan />
      </>
    ),
    receipts: link('/fees/counter', t('fx.counter')),
  } as Partial<Record<string, React.ReactNode>>;
  const header = (
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
  );

  if (kit) {
    const records = await loadRecords(kit, sp);
    return (
      <>
        {header}
        {entity === 'closings' && <CloseDay periods={extra.data?.periods ?? []} />}
        {records.error !== undefined ? <ErrorState message={records.error} /> : <FeeKitTable meta={records.data.meta} page={records.data.page} state={records.data.state} label={title} />}
      </>
    );
  }

  // The student fee accounts summary: a report-like list by status.
  const spec = LISTS[entity];
  const status = typeof sp.status === 'string' && spec.statuses?.includes(sp.status) ? sp.status : undefined;
  const data = await load(() => api<Row[]>(`/v1/fee-accounts/list/${entity}${status ? `?status=${status}` : ''}`));
  return (
    <>
      {header}
      {spec.statuses && (
        <LinkTabs
          label={title}
          value={status ?? 'all'}
          items={[{ value: 'all', label: t('fd.all'), href: `/accounts/${entity}` }, ...spec.statuses.map((s) => ({ value: s, label: t(`fd.st.${s}` as MessageKey), href: `/accounts/${entity}?status=${s}` }))]}
        />
      )}
      {data.error !== undefined ? <ErrorState message={data.error} /> : <SpecTable columns={spec.columns} rows={data.data} label={title} href={`/accounts/${entity}/{id}`} exportName={entity} empty={t('fd.empty')} />}
    </>
  );
}
