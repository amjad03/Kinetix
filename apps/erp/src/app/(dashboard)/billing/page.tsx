import type { Metadata } from 'next';
import { BillingDesk } from '@/components/billing/BillingDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { SaasInvoice, SaasPlan, SaasSubscriptionView } from '@/lib/governance';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.billing') };
}

/** The institution's own KINETIX subscription: plan, usage, invoices and GST. */
export default async function BillingPage() {
  await requireSection('billing');
  const { t } = await getI18n();
  const [view, plans, invoices] = await Promise.all([
    load(() => api<SaasSubscriptionView>('/v1/billing/subscription')),
    load(() => api<SaasPlan[]>('/v1/billing/plans')),
    load(() => api<SaasInvoice[]>('/v1/billing/invoices')),
  ]);
  const failed = view.error ?? plans.error ?? invoices.error;
  return (
    <>
      <PageHeader title={t('nav.billing')} subtitle={t('bl.subtitle')} />
      {failed !== undefined ? <ErrorState message={failed} /> : <BillingDesk view={view.data!} plans={plans.data!} invoices={invoices.data!} />}
    </>
  );
}
