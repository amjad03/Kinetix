import type { Metadata } from 'next';
import { SponsorDesk } from '@/components/fees/SponsorDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { SponsorInvoiceRow, SponsorOutstanding, SponsorRow } from '@/lib/payments-desk';
import type { FeeInvoice } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pd.sponsors.title') };
}

/** Billing to sponsor organisations: invoices against a PO, part payments and what is still outstanding. */
export default async function SponsorsPage() {
  await requireSection('fees');
  const { t } = await getI18n();
  const [sponsors, invoices, outstanding, fees] = await Promise.all([
    load(() => api<SponsorRow[]>('/v1/fees/sponsors')),
    load(() => api<SponsorInvoiceRow[]>('/v1/fees/sponsor-invoices')),
    load(() => api<SponsorOutstanding>('/v1/fees/sponsor-invoices/outstanding')),
    load(() => api<FeeInvoice[]>('/v1/fees/invoices')),
  ]);
  const failed = sponsors.error ?? invoices.error ?? outstanding.error;
  // Students the accounts office can pick: those who have a fee invoice, once each.
  const seen = new Map<string, { id: string; label: string }>();
  for (const i of fees.data ?? []) if (!seen.has(i.student.id)) seen.set(i.student.id, { id: i.student.id, label: `${i.student.fullName} (${i.className})` });
  return (
    <>
      <PageHeader title={t('pd.sponsors.title')} subtitle={t('pd.sponsors.subtitle')} />
      {failed !== undefined ? <ErrorState message={failed} /> : <SponsorDesk sponsors={sponsors.data!} invoices={invoices.data!} outstanding={outstanding.data!} students={[...seen.values()]} />}
    </>
  );
}
