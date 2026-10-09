import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

interface Coverage {
  days: number;
  assets: Record<string, unknown>[];
  summary: { amc: number; warranty: number; none: number; endingSoon: number };
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.ast.title') };
}

/** AMC contracts, warranty cover, and smartboards recorded in the asset register against their rooms. */
export default async function AmcPage() {
  await requireSection('assets');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [amc, coverage, boards, assets, vendors] = await Promise.all([
      api<Record<string, unknown>[]>('/v1/asset-ops/amc'),
      api<Coverage>('/v1/asset-ops/coverage'),
      api<Record<string, unknown>[]>('/v1/asset-ops/smartboards'),
      safe(api<{ id: string; tag: string; name: string }[]>('/v1/assets'), []),
      safe(api<{ id: string; name: string }[]>('/v1/inventory/vendors'), []),
    ]);
    return { amc, coverage, boards, assets, vendors };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { amc, coverage, boards, assets, vendors } = data.data;
  const words = stateWords(t);

  const panels: Panel[] = [
    {
      id: 'amc',
      title: t('dx.ast.amc'),
      hint: t('dx.ast.amcHint'),
      empty: t('dx.ast.noAmc'),
      columns: [
        { key: 'title', label: t('dx.c.title') },
        { key: 'assetName', label: t('dx.ast.asset') },
        { key: 'vendorName', label: t('dx.ast.vendor') },
        { key: 'startsOn', label: t('dx.c.from'), kind: 'date' },
        { key: 'endsOn', label: t('dx.c.to'), kind: 'date' },
        { key: 'costPaise', label: t('dx.c.amount'), kind: 'paise' },
        { key: 'visitsDone', label: t('dx.ast.visits'), kind: 'num' },
        { key: 'visitsPerYear', label: t('dx.ast.perYear'), kind: 'num' },
        { key: 'state', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
      ],
      rows: amc,
      actions: [
        { label: t('dx.ast.visit'), path: '/v1/asset-ops/amc/{id}/visit', show: { key: 'state', is: ['active', 'expiring'] }, fields: [{ name: 'note', label: t('dx.c.note'), type: 'text' }] },
        { label: t('dx.cancel'), path: '/v1/asset-ops/amc/{id}/cancel', show: { key: 'state', is: ['active', 'expiring'] }, confirm: t('dx.ast.cancelConfirm') },
      ],
      forms: [
        {
          id: 'amc',
          title: t('dx.ast.newAmc'),
          submit: t('dx.add'),
          path: '/v1/asset-ops/amc',
          fields: [
            { name: 'title', label: t('dx.c.title'), type: 'text', required: true },
            { name: 'assetId', label: t('dx.ast.asset'), type: 'select', options: opt(assets, (a) => a.id, (a) => `${a.tag} ${a.name}`) },
            { name: 'vendorId', label: t('dx.ast.vendor'), type: 'select', options: opt(vendors, (v) => v.id, (v) => v.name) },
            { name: 'vendorName', label: t('dx.ast.vendorName'), type: 'text' },
            { name: 'startsOn', label: t('dx.c.from'), type: 'date', required: true },
            { name: 'endsOn', label: t('dx.c.to'), type: 'date', required: true },
            { name: 'costPaise', label: t('dx.c.amount'), type: 'paise' },
            { name: 'visitsPerYear', label: t('dx.ast.perYear'), type: 'number' },
            { name: 'covers', label: t('dx.ast.covers'), type: 'text' },
            { name: 'contact', label: t('dx.ast.contact'), type: 'text' },
          ],
        },
      ],
    },
    {
      id: 'coverage',
      title: t('dx.ast.coverage'),
      hint: t('dx.ast.coverageHint', { days: coverage.days }),
      empty: t('dx.ast.noAssets'),
      stats: [
        { label: t('dx.state.amc'), value: fmt.number(coverage.summary.amc) },
        { label: t('dx.state.warranty'), value: fmt.number(coverage.summary.warranty) },
        { label: t('dx.state.none'), value: fmt.number(coverage.summary.none) },
        { label: t('dx.ast.endingSoon'), value: fmt.number(coverage.summary.endingSoon) },
      ],
      columns: [
        { key: 'tag', label: t('dx.ast.tag') },
        { key: 'name', label: t('dx.c.name') },
        { key: 'room', label: t('dx.c.room') },
        { key: 'serialNo', label: t('dx.ast.serial') },
        { key: 'cover', label: t('dx.ast.cover'), kind: 'pill', words, tones: STATE_TONES },
        { key: 'coverEndsOn', label: t('dx.ast.coverEnds'), kind: 'date' },
        { key: 'endingSoon', label: t('dx.ast.endingSoon'), kind: 'yes' },
      ],
      rows: coverage.assets,
      actions: [{ label: t('dx.ast.setWarranty'), method: 'PUT', path: '/v1/asset-ops/assets/{id}/warranty', fields: [{ name: 'warrantyUntil', label: t('dx.ast.warrantyUntil'), type: 'date', required: true }, { name: 'serialNo', label: t('dx.ast.serial'), type: 'text' }] }],
    },
    {
      id: 'boards',
      title: t('dx.ast.boards'),
      hint: t('dx.ast.boardsHint'),
      empty: t('dx.ast.noBoards'),
      columns: [
        { key: 'name', label: t('dx.c.name') },
        { key: 'room', label: t('dx.c.room') },
        { key: 'lastSeenAt', label: t('dx.ast.lastSeen'), kind: 'datetime' },
        { key: 'assetTag', label: t('dx.ast.tag') },
        { key: 'warrantyUntil', label: t('dx.ast.warrantyUntil'), kind: 'date' },
      ],
      rows: boards.map((b) => ({ ...b, id: b.deviceId })),
      actions: [
        {
          label: t('dx.ast.register'),
          path: '/v1/asset-ops/smartboards/{id}/link',
          show: { key: 'assetTag', is: [null] },
          fields: [
            { name: 'create.costPaise', label: t('dx.ast.cost'), type: 'paise', required: true },
            { name: 'create.purchasedOn', label: t('dx.ast.purchasedOn'), type: 'date', required: true },
            { name: 'create.usefulLifeYears', label: t('dx.ast.life'), type: 'number', initial: '6', required: true },
          ],
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader title={t('dx.ast.title')} subtitle={t('dx.ast.subtitle')} />
      <DepthDesk panels={panels} />
    </>
  );
}
