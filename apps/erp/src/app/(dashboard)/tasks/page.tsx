import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { TaskDesk } from '@/components/tasks/TaskDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { TaskRow } from '@/lib/work';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.tasks') };
}

export default async function TasksPage() {
  await requireSection('tasks');
  const { t } = await getI18n();
  const mine = await load(() => api<TaskRow[]>('/v1/tasks/mine'));
  const assigned = await load(() => api<TaskRow[]>('/v1/tasks/assigned-by-me'));
  const people = await load(() => api<{ id: string; fullName: string }[]>('/v1/tasks/people'));
  if (mine.error !== undefined || assigned.error !== undefined) return <ErrorState message={mine.error ?? assigned.error ?? ''} />;
  return (
    <>
      <PageHeader title={t('nav.tasks')} subtitle={t('wk.tk.subtitle')} />
      <StatGrid min={120}>
        <StatTile label={t('wk.tk.stat.mine')} value={mine.data.length} testId="tk-mine" />
        <StatTile label={t('wk.tk.stat.overdue')} value={mine.data.filter((x) => x.overdue).length} tone={mine.data.some((x) => x.overdue) ? 'warning' : 'default'} />
        <StatTile label={t('wk.tk.stat.assigned')} value={assigned.data.length} />
      </StatGrid>
      <TaskDesk mine={mine.data} assigned={assigned.data} people={people.data ?? []} />
    </>
  );
}
