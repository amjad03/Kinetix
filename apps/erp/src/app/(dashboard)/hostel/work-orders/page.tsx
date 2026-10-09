import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, STATE_TONES, stateWords } from '@/lib/depth-ui';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.hw.title') };
}

/** Hostel repairs: a complaint becomes a work order that is assigned, done, and checked by the warden. */
export default async function WorkOrdersPage() {
  await requireSection('hostel');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [orders, complaints] = await Promise.all([api<Record<string, unknown>[]>('/v1/hostel/work-orders'), api<{ id: string; description: string; category: string; status: string }[]>('/v1/hostel/complaints')]);
    return { orders, complaints };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { orders, complaints } = data.data;
  const words = stateWords(t);
  const taken = new Set(orders.filter((o) => o.status !== 'verified').map((o) => o.complaintId));
  const open = complaints.filter((c) => c.status !== 'resolved' && !taken.has(c.id));
  const priorities = ['low', 'normal', 'high', 'urgent'] as const;
  const pWords = Object.fromEntries(priorities.map((p) => [p, t(`dx.hw.p.${p}`)]));

  const panels: Panel[] = [
    {
      id: 'orders',
      title: t('dx.hw.orders'),
      hint: t('dx.hw.hint'),
      empty: t('dx.hw.none'),
      columns: [
        { key: 'title', label: t('dx.c.title') },
        { key: 'room', label: t('dx.c.room') },
        { key: 'category', label: t('dx.c.category') },
        { key: 'priority', label: t('dx.hw.priority'), kind: 'pill', words: pWords, tones: { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'neutral' } },
        { key: 'assigneeName', label: t('dx.hw.assignee') },
        { key: 'dueOn', label: t('dx.lib.due'), kind: 'date' },
        { key: 'costPaise', label: t('dx.hw.cost'), kind: 'paise' },
        { key: 'overdue', label: t('dx.lib.overdue'), kind: 'yes' },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
      ],
      rows: orders,
      actions: [
        { label: t('dx.hw.assign'), path: '/v1/hostel/work-orders/{id}/assign', show: { key: 'status', is: ['open', 'reopened', 'assigned'] }, fields: [{ name: 'assigneeName', label: t('dx.hw.assignee'), type: 'text', required: true }, { name: 'dueOn', label: t('dx.lib.due'), type: 'date' }] },
        { label: t('dx.hw.start'), path: '/v1/hostel/work-orders/{id}/start', show: { key: 'status', is: ['open', 'reopened', 'assigned'] } },
        { label: t('dx.hw.complete'), path: '/v1/hostel/work-orders/{id}/complete', show: { key: 'status', is: ['in_progress'] }, fields: [{ name: 'costPaise', label: t('dx.hw.cost'), type: 'paise' }, { name: 'note', label: t('dx.c.note'), type: 'text' }] },
        { label: t('dx.hw.accept'), path: '/v1/hostel/work-orders/{id}/verify', body: { ok: true }, show: { key: 'status', is: ['done'] } },
        { label: t('dx.hw.reopen'), path: '/v1/hostel/work-orders/{id}/verify', body: { ok: false }, show: { key: 'status', is: ['done'] }, fields: [{ name: 'note', label: t('dx.c.reason'), type: 'text', required: true }] },
      ],
      forms: [
        {
          id: 'order',
          title: t('dx.hw.new'),
          submit: t('dx.add'),
          path: '/v1/hostel/work-orders',
          fields: [
            { name: 'complaintId', label: t('dx.hw.complaint'), type: 'select', options: opt(open, (c) => c.id, (c) => `${c.category}: ${c.description.slice(0, 60)}`), hint: t('dx.hw.complaintHint') },
            { name: 'title', label: t('dx.c.title'), type: 'text', required: true },
            { name: 'category', label: t('dx.c.category'), type: 'text', initial: 'general' },
            { name: 'priority', label: t('dx.hw.priority'), type: 'select', options: opt([...priorities], (p) => p, (p) => pWords[p]), initial: 'normal' },
            { name: 'assigneeName', label: t('dx.hw.assignee'), type: 'text' },
            { name: 'dueOn', label: t('dx.lib.due'), type: 'date' },
          ],
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader title={t('dx.hw.title')} subtitle={t('dx.hw.subtitle')} />
      <DepthDesk panels={panels} />
    </>
  );
}
