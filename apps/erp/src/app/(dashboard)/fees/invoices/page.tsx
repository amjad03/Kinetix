import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { IssueFeeButton } from '@/components/fees/IssueFeeDialog';
import { InvoiceFilters } from '@/components/fees/InvoiceFilters';
import { InvoicesTable } from '@/components/fees/InvoicesTable';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { feeClasses } from '@/lib/fees';
import { INVOICE_FILTERS, type InvoiceFilter } from '@/lib/invoices';
import { schoolToday, TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { FeeInvoice, FeeSummary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fees.invoices') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ class?: string; status?: string }> }) {
  await requireSection('fees');
  const sp = await searchParams;
  const status: InvoiceFilter = (INVOICE_FILTERS as readonly string[]).includes(sp.status ?? '') ? (sp.status as InvoiceFilter) : 'due';
  const classId = sp.class && UUID.test(sp.class) ? sp.class : '';
  const today = schoolToday();

  const q = new URLSearchParams();
  if (classId) q.set('sectionId', classId);
  if (status === 'overdue') q.set('status', 'due');
  else if (status !== 'all') q.set('status', status);

  const [invoices, summary] = await Promise.all([load(() => api<FeeInvoice[]>(`/v1/fees/invoices?${q}`)), load(() => api<FeeSummary>('/v1/fees/summary'))]);
  const classes = await load(feeClasses);
  const list = (invoices.data ?? []).filter((i) => status !== 'overdue' || i.dueOn < today);
  const filterClasses = (summary.data?.classes ?? []).map((c) => ({ id: c.sectionId, name: c.className }));
  const className = filterClasses.find((c) => c.id === classId)?.name;
  const { t } = await getI18n();

  return (
    <>
      <Box sx={{ ml: -1, mb: 0.5 }}>
        <LinkButton href="/fees" size="small" startIcon={<ArrowBack />}>
          {t('nav.fees')}
        </LinkButton>
      </Box>
      <PageHeader
        title={className ? t('fees.invoicesTitle', { name: className }) : t('fees.invoices')}
        subtitle={t('fees.invoicesSubtitle')}
        actions={<IssueFeeButton classes={classes.data ?? []} today={today} defaultClassId={classId || undefined} />}
      />
      <InvoiceFilters status={status} classId={classId} classes={filterClasses} />
      {invoices.error !== undefined ? <ErrorState message={invoices.error} /> : <InvoicesTable key={`${status}:${classId}`} invoices={list} today={today} timeZone={TIMEZONE} />}
    </>
  );
}
