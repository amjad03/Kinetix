import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt } from '@/lib/depth-ui';

interface Summary {
  items: { item: string; unit: string; purchased: number; used: number; wasted: number; balance: number; wastePercent: number; spendPaise: number }[];
  meals: { meal: string; used: number; wasted: number; wastePercent: number }[];
  vendors: { vendorId: string; name: string; spendPaise: number }[];
  totals: { spendPaise: number; entries: number };
}
interface Feedback {
  meals: { meal: string; count: number; average: number | null }[];
  comments: { mealDate: string; meal: string; rating: number; comment: string }[];
  total: number;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.cn.title') };
}

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;

/** Kitchen stock tied to vendors and the store, wastage, and meal feedback. */
export default async function CanteenOperationsPage() {
  await requireSection('canteen');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [stock, summary, feedback, options] = await Promise.all([
      api<Record<string, unknown>[]>('/v1/canteen/ops/stock'),
      api<Summary>('/v1/canteen/ops/summary'),
      api<Feedback>('/v1/canteen/ops/feedback'),
      api<{ vendors: { id: string; name: string }[]; items: { id: string; name: string; unit: string }[] }>('/v1/canteen/ops/options'),
    ]);
    return { stock, summary, feedback, options };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { stock, summary, feedback, options } = data.data;
  const mealWords = Object.fromEntries(MEALS.map((m) => [m, t(`dx.cn.meal.${m}`)]));
  const kindWords = { purchase: t('dx.cn.k.purchase'), use: t('dx.cn.k.use'), waste: t('dx.cn.k.waste') };

  const panels: Panel[] = [
    {
      id: 'summary',
      title: t('dx.cn.summary'),
      hint: t('dx.cn.summaryHint'),
      empty: t('dx.cn.noStock'),
      stats: [{ label: t('dx.cn.spend'), value: fmt.rupees(summary.totals.spendPaise) }, ...summary.vendors.slice(0, 3).map((v) => ({ label: v.name, value: fmt.rupees(v.spendPaise) }))],
      columns: [
        { key: 'item', label: t('dx.c.name') },
        { key: 'unit', label: t('dx.c.unit') },
        { key: 'purchased', label: t('dx.cn.purchased'), kind: 'num' },
        { key: 'used', label: t('dx.cn.used'), kind: 'num' },
        { key: 'wasted', label: t('dx.cn.wasted'), kind: 'num' },
        { key: 'balance', label: t('dx.cn.balance'), kind: 'num' },
        { key: 'wastePercent', label: t('dx.cn.wastePercent'), kind: 'pct' },
        { key: 'spendPaise', label: t('dx.cn.spend'), kind: 'paise' },
      ],
      rows: summary.items.map((i) => ({ ...i, id: i.item })),
    },
    {
      id: 'meals',
      title: t('dx.cn.byMeal'),
      empty: t('dx.cn.noStock'),
      columns: [
        { key: 'meal', label: t('dx.cn.mealCol'), kind: 'pill', words: mealWords },
        { key: 'used', label: t('dx.cn.used'), kind: 'num' },
        { key: 'wasted', label: t('dx.cn.wasted'), kind: 'num' },
        { key: 'wastePercent', label: t('dx.cn.wastePercent'), kind: 'pct' },
      ],
      rows: summary.meals.map((m) => ({ ...m, id: m.meal })),
    },
    {
      id: 'stock',
      title: t('dx.cn.stock'),
      empty: t('dx.cn.noStock'),
      columns: [
        { key: 'loggedOn', label: t('dx.c.date'), kind: 'date' },
        { key: 'kind', label: t('dx.c.kind'), kind: 'pill', words: kindWords, tones: { purchase: 'info', use: 'neutral', waste: 'warning' } },
        { key: 'meal', label: t('dx.cn.mealCol'), kind: 'pill', words: mealWords },
        { key: 'itemName', label: t('dx.c.name') },
        { key: 'quantity', label: t('dx.cn.quantity'), kind: 'num' },
        { key: 'unit', label: t('dx.c.unit') },
        { key: 'costPaise', label: t('dx.c.amount'), kind: 'paise' },
        { key: 'vendor', label: t('dx.ast.vendor') },
        { key: 'storeItem', label: t('dx.cn.storeItem') },
        { key: 'reason', label: t('dx.c.reason') },
      ],
      rows: stock.slice(0, 100),
      forms: [
        {
          id: 'log',
          title: t('dx.cn.log'),
          submit: t('dx.add'),
          path: '/v1/canteen/ops/stock',
          fields: [
            { name: 'kind', label: t('dx.c.kind'), type: 'select', options: opt(['purchase', 'use', 'waste'] as const, (k) => k, (k) => kindWords[k]), required: true },
            { name: 'loggedOn', label: t('dx.c.date'), type: 'date', required: true },
            { name: 'meal', label: t('dx.cn.mealCol'), type: 'select', options: opt([...MEALS], (m) => m, (m) => mealWords[m]) },
            { name: 'itemName', label: t('dx.c.name'), type: 'text', required: true },
            { name: 'quantity', label: t('dx.cn.quantity'), type: 'number', required: true },
            { name: 'unit', label: t('dx.c.unit'), type: 'text', initial: 'kg' },
            { name: 'costPaise', label: t('dx.c.amount'), type: 'paise', hint: t('dx.cn.costHint') },
            { name: 'vendorId', label: t('dx.ast.vendor'), type: 'select', options: opt(options.vendors, (v) => v.id, (v) => v.name) },
            { name: 'invItemId', label: t('dx.cn.storeItem'), type: 'select', options: opt(options.items, (i) => i.id, (i) => `${i.name} (${i.unit})`) },
            { name: 'issueFromStore', label: t('dx.cn.drawFromStore'), type: 'bool', initial: 'false' },
            { name: 'reason', label: t('dx.c.reason'), type: 'text', hint: t('dx.cn.reasonHint') },
          ],
        },
      ],
    },
    {
      id: 'feedback',
      title: t('dx.cn.feedback'),
      hint: t('dx.cn.feedbackHint', { count: feedback.total }),
      empty: t('dx.cn.noFeedback'),
      columns: [
        { key: 'mealDate', label: t('dx.c.date'), kind: 'date' },
        { key: 'meal', label: t('dx.cn.mealCol'), kind: 'pill', words: mealWords },
        { key: 'rating', label: t('dx.cn.rating'), kind: 'num' },
        { key: 'comment', label: t('dx.c.note') },
      ],
      stats: feedback.meals.filter((m) => m.average !== null).map((m) => ({ label: mealWords[m.meal], value: `${fmt.number(m.average as number, { maximumFractionDigits: 1 })} (${m.count})` })),
      rows: feedback.comments,
      forms: [
        {
          id: 'rate',
          title: t('dx.cn.rateMeal'),
          submit: t('dx.cn.submitRating'),
          path: '/v1/canteen/ops/feedback',
          fields: [
            { name: 'mealDate', label: t('dx.c.date'), type: 'date', required: true },
            { name: 'meal', label: t('dx.cn.mealCol'), type: 'select', options: opt([...MEALS], (m) => m, (m) => mealWords[m]), required: true },
            { name: 'rating', label: t('dx.cn.rating'), type: 'number', required: true, hint: t('dx.cn.ratingHint') },
            { name: 'comment', label: t('dx.c.note'), type: 'text' },
          ],
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader title={t('dx.cn.title')} subtitle={t('dx.cn.subtitle')} />
      <DepthDesk panels={panels} />
    </>
  );
}
