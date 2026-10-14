import type { Metadata } from 'next';
import { DuesDesk } from '@/components/fee-depth/DuesDesk';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { fyOf, type ReminderRun } from '@/lib/fee-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fo.tab.dues') };
}

/** Reminders, the daily summary and carrying dues into the next year. */
export default async function DuesPage() {
  await requireSection('fees');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [settings, runs, counter] = await Promise.all([api<{ reminders: Record<string, unknown> }>('/v1/fee-accounts/settings'), api<ReminderRun[]>('/v1/fee-collect/reminders/runs'), api<{ today: string }>('/v1/fee-collect/counter-settings')]);
    return { settings, runs, today: counter.today };
  });
  return (
    <>
      <PageHeader title={t('fo.tab.dues')} subtitle={t('fx.duesSub')} />
      <FeesNav value="dues" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <DuesDesk schedule={data.data.settings.reminders ?? {}} runs={data.data.runs} fy={fyOf(data.data.today)} />}
    </>
  );
}
