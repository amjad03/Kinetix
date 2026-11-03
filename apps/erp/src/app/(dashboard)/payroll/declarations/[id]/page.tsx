import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinkButton } from '@/components/LinkButton';
import { DeclarationReview } from '@/components/payroll/PayPass';
import { ErrorState, PageHeader, StatusPill } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import type { Declaration } from '@/lib/hr-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rk.one.tax-declarations') };
}

/** One investment declaration: items, rent, proofs, and the approve / send back / verify decision. */
export default async function DeclarationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('payroll');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() => api<Declaration>(`/v1/hr/tax-declarations/${id}`));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('rk.one.tax-declarations')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const d = data.data;
  return (
    <>
      <PageHeader
        title={`${d.fullName}${d.employeeCode ? ` · ${d.employeeCode}` : ''}`}
        subtitle={t('hp.decl.subtitle', { fy: d.fyLabel, regime: t(`hp.regime.${d.regime}` as MessageKey) })}
        actions={
          <>
            <StatusPill tone={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'danger' : 'warning'}>{t(`hp.decl.status.${d.status}` as MessageKey)}</StatusPill>
            <LinkButton href="/payroll/claims?view=declarations">{t('rk.entity.tax-declarations')}</LinkButton>
          </>
        }
      />
      <DeclarationReview d={d} />
    </>
  );
}
