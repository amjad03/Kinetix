import type { Metadata } from 'next';
import Link from 'next/link';
import { Counter } from '@/components/fee-depth/Counter';
import { FeeHoldPanel } from '@/components/fee-depth/FeeHolds';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { StudentDues } from '@/lib/fee-depth';
import { canOverrideFeeHold, type FeeHoldStatus } from '@/lib/fee-holds';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fx.counter') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The fees counter (?student=<id> opens that student's dues). */
export default async function CounterPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const me = await requireSection('fees');
  const { student } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => ({
    settings: await api<{ modes: string[]; today: string }>('/v1/fee-collect/counter-settings'),
    dues: student && UUID.test(student) ? await api<StudentDues>(`/v1/fee-collect/students/${student}`) : null,
  }));
  // What the student's dues hold back (hall ticket, result, TC), so the desk can tell the family.
  const holds = student && UUID.test(student) && data.error === undefined ? await load(() => api<FeeHoldStatus>(`/v1/fee-holds/${student}`)) : null;
  return (
    <>
      <PageHeader
        title={t('fx.counter')}
        subtitle={t('fx.counterSub')}
        actions={
          <Button asChild variant="outline" className="h-9">
            <Link href="/accounts/receipts?f.day=today">{t('fx.todaysReceipts')}</Link>
          </Button>
        }
      />
      <FeesNav value="counter" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <Counter key={data.data.dues?.student.id ?? 'pick'} dues={data.data.dues} modes={data.data.settings.modes} />}
      {student && holds?.data && holds.data.holds.some((h) => h.enabled) && <FeeHoldPanel studentId={student} status={holds.data} canOverride={canOverrideFeeHold(me?.roles ?? [])} canSettings />}
    </>
  );
}
