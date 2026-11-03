import type { Metadata } from 'next';
import { HrList } from '@/components/hr/HrList';
import { ErrorState, LinkTabs, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hp.claims.title') };
}

/** Reimbursement claims (approve onto a pay month, reject) and investment declarations (approve, verify proofs) for HR and accounts. */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('payroll');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'declarations' ? 'declarations' : 'claims';
  const entity = view === 'declarations' ? 'tax-declarations' : 'reimbursement-claims';
  const list = await loadRecords(entity, sp);
  return (
    <>
      <PageHeader title={t('hp.claims.title')} subtitle={t('hp.claims.subtitle')} />
      <LinkTabs
        value={view}
        label={t('hp.claims.title')}
        items={[
          { value: 'claims', href: '/payroll/claims', label: t('rk.entity.reimbursement-claims') },
          { value: 'declarations', href: '/payroll/claims?view=declarations', label: t('rk.entity.tax-declarations') },
        ]}
      />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity={entity} data={list.data} extraParams={{ view }} />}
    </>
  );
}
