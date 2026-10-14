import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { DueList } from '@/components/assets/DueList';
import { KitList, type ColSpec, type RowActionSpec } from '@/components/procurement/KitList';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { allocateAsset, condemnAsset, logMaintenance, postDepreciation, rejectCondemnation, returnAsset, transferAsset, writeOffAsset } from '@/app/(dashboard)/assets/actions';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { assetTagsUrl } from '@/lib/documents';
import { formatRupees } from '@/lib/money';
import type { Asset, MaintDue } from '@/lib/ops';
import { st as opsSt } from '@/lib/ops-labels';
import { statusLabels } from '@/lib/procurement-labels';
import { metaOptions, param } from '@/lib/procurement-server';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.assets') };
}

const VIEWS = ['register', 'amc', 'condemnations', 'service'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Partial<Record<View, string>> = { register: 'assets', amc: 'amc-contracts', condemnations: 'asset-condemnations' };
const DISPOSAL = ['auction', 'scrap', 'donate', 'buyback'] as const;

/**
 * The asset register (tag, room, department, supplier, warranty, custodian, book value) with giving out, servicing,
 * moving between rooms and condemnation; maintenance contracts; the condemnation register (committee decision, then
 * write-off by auction, scrap, donation or buy-back); and servicing that falls due.
 */
export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('assets');
  const sp = await searchParams;
  const asked = param(sp, 'view');
  const view: View = VIEWS.includes(asked as View) ? (asked as View) : 'register';
  const { t } = await getI18n();
  const entity = ENTITY[view];
  const [list, base] = await Promise.all([
    entity ? loadRecords(entity, sp) : null,
    load(async () => {
      const [assets, due] = await Promise.all([api<Asset[]>('/v1/assets'), api<MaintDue[]>('/v1/assets/maintenance-due')]);
      return { assets, due };
    }),
  ]);
  const failed = list?.error ?? base.error;
  const all = base.data?.assets ?? [];
  const live = all.filter((x) => x.status !== 'disposed');
  const due = base.data?.due ?? [];
  const st = statusLabels(t);
  const meta = list?.data?.meta;
  const rooms = view === 'register' ? metaOptions(meta, 'roomId') : [];
  const departments = view === 'register' ? metaOptions(meta, 'departmentId') : [];
  const write = meta?.can.write ?? false;
  const extraParams = { view };

  const cols: Record<string, ColSpec[]> = {
    register: [
      { id: 'tag', label: t('as.tag'), key: 'tag', sortKey: 'tag', rowHeader: true, href: '/assets/{id}' },
      { id: 'name', label: t('ops.f.name'), key: 'name', sortKey: 'name', sub: 'category' },
      { id: 'room', label: t('ivd.as.room'), key: 'roomName', sortKey: 'room', hideBelow: 'md', sub: 'location' },
      { id: 'department', label: t('ivd.department'), key: 'departmentName', sortKey: 'department', hideBelow: 'lg' },
      { id: 'holder', label: t('as.assignedTo'), key: 'holder', hideBelow: 'md' },
      { id: 'cost', label: t('as.cost'), key: 'cost', kind: 'rupees', sortKey: 'cost' },
      { id: 'purchased', label: t('as.purchasedOn'), key: 'purchasedOn', kind: 'date', sortKey: 'purchasedOn', defaultHidden: true },
      { id: 'warranty', label: t('ivd.as.warranty'), key: 'warrantyUntil', kind: 'date', defaultHidden: true },
      { id: 'supplier', label: t('ivd.as.supplier'), key: 'vendorName', defaultHidden: true },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st },
    ],
    amc: [
      { id: 'title', label: t('ops.f.title'), key: 'title', sortKey: 'title', rowHeader: true, sub: 'covers' },
      { id: 'asset', label: t('ivd.as.asset'), key: 'assetTag', sub: 'assetName', hideBelow: 'md' },
      { id: 'supplier', label: t('ivd.as.provider'), key: 'supplier', hideBelow: 'sm' },
      { id: 'ends', label: t('ivd.as.endsOn'), key: 'endsOn', kind: 'date', sortKey: 'endsOn' },
      { id: 'cost', label: t('as.cost'), key: 'cost', kind: 'rupees', sortKey: 'cost', hideBelow: 'md' },
      { id: 'visits', label: t('ivd.as.visits'), key: 'visitsDone', kind: 'number', hideBelow: 'lg' },
      { id: 'state', label: t('ops.f.status'), key: 'state', kind: 'status', labels: st },
    ],
    condemnations: [
      { id: 'number', label: t('inv.number'), key: 'number', sortKey: 'number', rowHeader: true },
      { id: 'asset', label: t('ivd.as.asset'), key: 'assetTag', sortKey: 'asset', href: '/assets/{assetId}', sub: 'assetName' },
      { id: 'reason', label: t('ho.reason'), key: 'reason', hideBelow: 'md' },
      { id: 'cost', label: t('as.cost'), key: 'bookCost', kind: 'rupees', hideBelow: 'lg' },
      { id: 'realised', label: t('ivd.as.realised'), key: 'realised', kind: 'rupees', hideBelow: 'md' },
      { id: 'proposer', label: t('ivd.as.proposedBy'), key: 'proposerName', defaultHidden: true },
      { id: 'created', label: t('ivd.date'), key: 'createdAt', kind: 'date', sortKey: 'created', hideBelow: 'sm' },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st },
    ],
  };
  const yesNo = [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }];
  const rowActions: Record<string, RowActionSpec[]> = write
    ? {
        register: [
          { id: 'allocate', label: t('as.allocate'), when: [{ key: 'status', not: ['disposed'] }, { key: 'holder', in: [null] }], fields: [{ name: 'assignedTo', label: t('as.assignedTo'), required: true }, { name: 'allocatedOn', label: t('as.from'), kind: 'date' }], done: t('ops.saved'), run: allocateAsset },
          { id: 'return', label: t('as.return'), when: [{ key: 'holder', not: [null] }], confirm: t('ivd.as.returnHelp'), done: t('ivd.as.returned'), run: returnAsset },
          {
            id: 'service',
            label: t('as.maintenance'),
            when: [{ key: 'status', not: ['disposed'] }],
            fields: [
              { name: 'kind', label: t('as.kind'), kind: 'select', required: true, init: 'service', options: ['service', 'repair', 'inspection'].map((k) => ({ value: k, label: opsSt(t, k) })) },
              { name: 'description', label: t('ho.description') },
              { name: 'cost', label: t('as.cost'), kind: 'rupees' },
              { name: 'doneOn', label: t('as.done'), kind: 'date', required: true },
              { name: 'nextDueOn', label: t('as.nextDue'), kind: 'date' },
              { name: 'ongoing', label: t('as.ongoing'), kind: 'select', init: 'no', options: yesNo },
            ],
            done: t('ops.saved'),
            run: logMaintenance,
          },
          {
            id: 'transfer',
            label: t('ivd.as.transfer'),
            when: [{ key: 'status', not: ['disposed'] }],
            fields: [
              { name: 'toRoomId', label: t('ivd.as.toRoom'), kind: 'select', options: rooms },
              { name: 'toDepartmentId', label: t('ivd.department'), kind: 'select', options: departments },
              { name: 'toLocation', label: t('as.location') },
              { name: 'reason', label: t('ho.reason'), required: true },
            ],
            done: t('ivd.as.moved'),
            run: transferAsset,
          },
          { id: 'condemn', label: t('ivd.as.condemn'), danger: true, when: [{ key: 'status', not: ['disposed'] }], fields: [{ name: 'reason', label: t('ho.reason'), kind: 'multiline', required: true }, { name: 'condition', label: t('ivd.as.condition') }], done: t('ivd.as.proposed'), run: condemnAsset },
        ],
        condemnations: [
          { id: 'reject', label: t('ivd.as.reject'), danger: true, when: [{ key: 'status', in: ['proposed'] }], fields: [{ name: 'note', label: t('ops.f.note'), kind: 'multiline', required: true }], done: t('ivd.as.rejected'), run: rejectCondemnation },
          {
            id: 'writeOff',
            label: t('ivd.as.writeOff'),
            when: [{ key: 'status', in: ['approved'] }],
            fields: [
              { name: 'disposalMode', label: t('ivd.as.disposal'), kind: 'select', required: true, options: DISPOSAL.map((m) => ({ value: m, label: t(`ivd.as.mode.${m}`) })) },
              { name: 'realised', label: t('ivd.as.realised'), kind: 'rupees' },
              { name: 'on', label: t('ivd.date'), kind: 'date' },
            ],
            done: t('ivd.as.writtenOff'),
            run: writeOffAsset,
          },
        ],
      }
    : {};

  return (
    <>
      <PageHeader title={t('nav.assets')} subtitle={t('as.subtitle')} actions={<LinkButton href="/assets/amc" variant="outlined">{t('dx.link.assets')}</LinkButton>} />
      <StatGrid min={140}>
        <StatTile label={t('as.registered')} value={live.length} testId="as-count" />
        <StatTile label={t('as.bookValue')} value={formatRupees(live.reduce((s, x) => s + x.bookValuePaise, 0))} testId="as-book" />
        <StatTile label={t('as.inMaintenance')} value={all.filter((x) => x.status === 'in_maintenance').length} testId="as-maint" />
        <StatTile label={t('as.serviceDue')} value={due.length} tone={due.length ? 'warning' : 'default'} testId="as-due" />
      </StatGrid>
      <LinkTabs value={view} label={t('nav.assets')} items={VIEWS.map((v) => ({ value: v, label: t(`ivd.aview.${v}`), href: `/assets?view=${v}` }))} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : list?.data ? (
        <KitList
          {...list.data}
          label={t(`ivd.aview.${view}`)}
          cols={cols[view]}
          extraParams={extraParams}
          rowHref={view === 'register' ? '/assets/{id}' : view === 'condemnations' ? '/assets/{assetId}' : undefined}
          rowActions={rowActions[view] ?? []}
          links={view === 'register' && all.length ? [{ label: t('as.printAllTags'), href: assetTagsUrl(), newTab: true }] : []}
          tools={view === 'register' && write && all.length ? [{ id: 'depreciation', label: t('as.postDep'), fields: [{ name: 'fiscalYear', label: t('as.fy'), required: true }], done: t('as.postedMsg'), run: postDepreciation }] : []}
          bulk={view === 'register' ? [{ id: 'tags', label: t('as.printTags'), href: '/api/download?kind=asset-tags&id={ids}' }] : []}
          emptyTitle={t(`ivd.empty.${view as 'register'}`)}
          emptyBody={t(`ivd.emptyHelp.${view as 'register'}`)}
          testId={`as-${view}`}
        />
      ) : (
        <DueList rows={due} />
      )}
    </>
  );
}
