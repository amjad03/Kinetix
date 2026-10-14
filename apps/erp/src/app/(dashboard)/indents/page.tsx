import type { Metadata } from 'next';
import { KitList, type ColSpec } from '@/components/procurement/KitList';
import { RaiseIndent } from '@/components/procurement/RaiseIndent';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { IItem } from '@/lib/ops';
import { statusLabels } from '@/lib/procurement-labels';
import { metaOptions } from '@/lib/procurement-server';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.indents') };
}

/**
 * Indents: any member of staff asks the stores for items; the department head and then the principal approve it
 * (the principal against the department's budget). Each person sees their own, a head their department's, the
 * stores and approvers all of them.
 */
export default async function IndentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('indents');
  const sp = await searchParams;
  const { t } = await getI18n();
  const [list, items] = await Promise.all([loadRecords('inv-requisitions', sp), load(() => api<IItem[]>('/v1/inventory/items'))]);
  const failed = list.error ?? items.error;
  const st = statusLabels(t);
  const cols: ColSpec[] = [
    { id: 'number', label: t('inv.number'), key: 'number', sortKey: 'number', rowHeader: true, href: '/indents/{id}', sub: 'reason' },
    { id: 'lines', label: t('ivd.lineCount'), key: 'lines', kind: 'number', hideBelow: 'md' },
    { id: 'department', label: t('ivd.department'), key: 'departmentName', hideBelow: 'sm' },
    { id: 'requester', label: t('ivd.requester'), key: 'requesterName', hideBelow: 'md' },
    { id: 'estimated', label: t('ivd.estimate'), key: 'estimated', kind: 'rupees', sortKey: 'estimated' },
    { id: 'budget', label: t('ivd.budget'), key: 'budgetStatus', kind: 'status', labels: st, hideBelow: 'lg' },
    { id: 'neededBy', label: t('ivd.neededBy'), key: 'neededBy', kind: 'date', sortKey: 'neededBy', hideBelow: 'lg' },
    { id: 'created', label: t('ivd.date'), key: 'createdAt', kind: 'date', sortKey: 'created', defaultHidden: true },
    { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st },
  ];
  return (
    <>
      <PageHeader
        title={t('nav.indents')}
        subtitle={t('ivd.ind.subtitle')}
        actions={list.data && items.data ? <RaiseIndent items={items.data.filter((i) => i.active).map((i) => ({ value: i.id, label: `${i.sku} · ${i.name} (${i.unit})`, unit: i.unit }))} departments={metaOptions(list.data.meta, 'department')} /> : undefined}
      />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <KitList {...list.data!} label={t('nav.indents')} cols={cols} rowHref="/indents/{id}" emptyTitle={t('ivd.empty.indents')} emptyBody={t('ivd.emptyHelp.indents')} testId="indents" />
      )}
    </>
  );
}
