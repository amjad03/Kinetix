import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt } from '@/lib/depth-ui';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.ret.title') };
}

/** How long health visits and counselling records are kept, and what happens to them afterwards. */
export default async function RetentionPage() {
  await requireSection('health');
  const { t } = await getI18n();
  const data = await load(() => api<Record<string, unknown>[]>('/v1/retention/sensitive/rules'));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const classWords = { health_visits: t('dx.ret.c.health_visits'), counselling: t('dx.ret.c.counselling') };
  const actionWords = { delete: t('dx.ret.a.delete'), redact: t('dx.ret.a.redact') };
  const panels: Panel[] = [
    {
      id: 'rules',
      title: t('dx.ret.rules'),
      hint: t('dx.ret.hint'),
      empty: t('dx.ret.none'),
      columns: [
        { key: 'dataClass', label: t('dx.ret.class'), kind: 'pill', words: classWords },
        { key: 'retainMonths', label: t('dx.ret.months'), kind: 'num' },
        { key: 'action', label: t('dx.ret.action'), kind: 'pill', words: actionWords },
        { key: 'active', label: t('dx.ret.active'), kind: 'yes' },
        { key: 'dueNow', label: t('dx.ret.dueNow'), kind: 'num' },
        { key: 'lastRunAt', label: t('dx.ret.lastRun'), kind: 'datetime' },
        { key: 'lastRunCount', label: t('dx.ret.lastCount'), kind: 'num' },
      ],
      rows: data.data.map((r) => ({ ...r, id: r.dataClass })),
      actions: [
        {
          label: t('dx.ret.set'),
          method: 'PUT',
          path: '/v1/retention/sensitive/rules/{id}',
          fields: [
            { name: 'retainMonths', label: t('dx.ret.months'), type: 'number', required: true, hint: t('dx.ret.monthsHint'), initial: '36' },
            { name: 'action', label: t('dx.ret.action'), type: 'select', options: opt(['delete', 'redact'] as const, (a) => a, (a) => actionWords[a]), required: true, initial: 'delete' },
            { name: 'active', label: t('dx.ret.active'), type: 'bool', initial: 'true' },
          ],
        },
      ],
      forms: [{ id: 'run', title: t('dx.ret.runTitle'), submit: t('dx.ret.run'), path: '/v1/retention/sensitive/run', fields: [] }],
    },
  ];
  return (
    <>
      <PageHeader title={t('dx.ret.title')} subtitle={t('dx.ret.subtitle')} />
      <DepthDesk panels={panels} />
    </>
  );
}
