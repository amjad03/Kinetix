import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExitRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { historyFor } from '@/lib/hr-records';
import type { SeparationDetail } from '@/lib/hr-lifecycle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.exit') };
}

/** An exit case: notice, clearance checklist, settlement and relieving letter. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('hr');
  const { id } = await params;
  if (![id].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<SeparationDetail>(`/v1/hr/separations/${id}`), historyFor('separation', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hl.tab.exit')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  if (!me) notFound();
  return <ExitRecord s={data.data[0]} activity={data.data[1]} />;
}
