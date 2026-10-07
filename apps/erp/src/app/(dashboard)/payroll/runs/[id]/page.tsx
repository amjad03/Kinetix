import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RunDetail } from '@/components/payroll/RunDetail';
import { PageHeader } from '@/components/PageHeader';
import { LinkButton } from '@/components/LinkButton';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canApprovePayroll } from '@/lib/access';
import { formatMonth } from '@/lib/dates';
import { getI18n } from '@/i18n/server';
import type { PayrollRunDetail } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.payroll') };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('payroll');
  const { id } = await params;
  const { t, locale } = await getI18n();
  const data = await load(() => api<PayrollRunDetail>(`/v1/payroll/runs/${id}`));
  if (data.error !== undefined) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    return (
      <>
        <PageHeader title={t('nav.payroll')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  return (
    <>
      <PageHeader title={t('pay.run.title', { month: formatMonth(`${data.data.month}-01`, locale) })} actions={<LinkButton href="/payroll">{t('pay.back')}</LinkButton>} />
      <RunDetail run={data.data} canApprove={!!me && canApprovePayroll(me.roles)} />
    </>
  );
}
