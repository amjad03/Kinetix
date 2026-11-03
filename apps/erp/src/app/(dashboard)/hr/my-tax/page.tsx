import type { Metadata } from 'next';
import { MyClaims, MyDeclaration } from '@/components/payroll/PayPass';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Claim, Declaration } from '@/lib/hr-pass';
import { schoolToday } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hp.my.title') };
}

/** Self-service: my investment declaration and proofs for the year, and my reimbursement claims. */
export default async function MyTaxPage() {
  await requireSection('payslips');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<{ fy: number; declaration: Declaration | null }>('/v1/hr/tax-declarations/me'), api<Claim[]>('/v1/hr/reimbursements/me')]));
  return (
    <>
      <PageHeader title={t('hp.my.title')} subtitle={t('hp.my.subtitle')} />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <div className="flex flex-col gap-6">
          <MyDeclaration fy={data.data[0].fy} declaration={data.data[0].declaration} />
          <MyClaims claims={data.data[1]} today={schoolToday()} />
        </div>
      )}
    </>
  );
}
