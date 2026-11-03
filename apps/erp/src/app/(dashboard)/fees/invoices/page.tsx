import type { Metadata } from 'next';
import { IssueFeeButton } from '@/components/fees/IssueFeeDialog';
import { InvoiceFilters } from '@/components/fees/InvoiceFilters';
import { InvoicesTable } from '@/components/fees/InvoicesTable';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkButton } from '@/components/LinkButton';
import { api, load, requireSection } from '@/lib/api';
import { invoicePage } from '@/lib/fee-invoices';
import { feeClasses } from '@/lib/fees';
import { INVOICE_FILTERS, type InvoiceFilter } from '@/lib/invoices';
import { schoolToday, TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { FeeInvoice, FeeSummary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fees.invoices') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAGE = 100;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ class?: string; status?: string; cursor?: string }> }) {
  await requireSection('fees');
  const sp = await searchParams;
  const status: InvoiceFilter = (INVOICE_FILTERS as readonly string[]).includes(sp.status ?? '') ? (sp.status as InvoiceFilter) : 'due';
  const classId = sp.class && UUID.test(sp.class) ? sp.class : '';
  const today = schoolToday();

  // One page at a time (oldest due first); the cursor comes back from the API and is passed on as it is.
  const cursor = sp.cursor && /^[A-Za-z0-9_-]{1,300}$/.test(sp.cursor) ? sp.cursor : undefined;
  const [invoices, summary] = await Promise.all([
    load(() =>
      invoicePage<FeeInvoice>({
        sectionId: classId || undefined,
        status: status === 'overdue' ? 'due' : status === 'all' ? undefined : status,
        dueBefore: status === 'overdue' ? today : undefined,
        cursor,
        limit: PAGE,
      }),
    ),
    load(() => api<FeeSummary>('/v1/fees/summary')),
  ]);
  const classes = await load(feeClasses);
  const list = invoices.data?.rows ?? [];
  const next = invoices.data?.nextCursor;
  const keep = new URLSearchParams();
  if (classId) keep.set('class', classId);
  if (sp.status) keep.set('status', status);
  const filterClasses = (summary.data?.classes ?? []).map((c) => ({ id: c.sectionId, name: c.className }));
  const className = filterClasses.find((c) => c.id === classId)?.name;
  const { t } = await getI18n();

  return (
    <>
      <PageHeader
        title={className ? t('fees.invoicesTitle', { name: className }) : t('fees.invoices')}
        subtitle={t('fees.invoicesSubtitle')}
        actions={<IssueFeeButton classes={classes.data ?? []} today={today} defaultClassId={classId || undefined} />}
      />
      <FeesNav value="invoices" />
      <InvoiceFilters status={status} classId={classId} classes={filterClasses} />
      {invoices.error !== undefined ? <ErrorState message={invoices.error} /> : <InvoicesTable key={`${status}:${classId}:${cursor ?? ''}`} invoices={list} today={today} timeZone={TIMEZONE} />}
      {(cursor || next) && (
        <nav className="mt-4 flex flex-wrap justify-end gap-2" aria-label={t('fees.invoices')} data-testid="invoice-pages">
          {cursor && (
            <LinkButton href={`/fees/invoices?${keep}`} variant="outlined">
              {t('fees.firstPage')}
            </LinkButton>
          )}
          {next && (
            <LinkButton href={`/fees/invoices?${new URLSearchParams([...keep, ['cursor', next]])}`} variant="outlined">
              {t('fees.nextPage')}
            </LinkButton>
          )}
        </nav>
      )}
    </>
  );
}
