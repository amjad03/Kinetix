import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { ErrorState } from '@/components/States';
import { FormRow } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { safe } from '@/lib/depth-ui';
import { pickFy, type Ageing, type Batch, type DeadStock, type Depreciation, type Labs, type MsmeDues, type Naac, type PurchaseRegister, type StockSummary } from '@/lib/inventory-pass';
import { param } from '@/lib/procurement-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ipass.reports') };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The stores and asset reports, computed on the server from the ledger and the register: stock summary with value,
 * ageing, dead stock, batches expiring, the purchase register with GST and its HSN summary, MSME dues, depreciation
 * under the Companies Act and the Income-tax Act, the lab equipment registers, and NAAC 4.1.2 and 4.4.1 for five years.
 * The filters are in the URL, so a report can be shared and bookmarked.
 */
export default async function InventoryReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('procurement');
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const fy = pickFy(param(sp, 'fy'), today);
  const from = DAY.test(param(sp, 'from') ?? '') ? param(sp, 'from')! : `${fy.slice(0, 4)}-04-01`;
  const to = DAY.test(param(sp, 'to') ?? '') ? param(sp, 'to')! : today;
  const idle = Math.min(3650, Math.max(30, Number(param(sp, 'idle')) || 365));
  const expiring = Math.min(365, Math.max(1, Number(param(sp, 'expiring')) || 60));
  const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
  const data = await load(async () => {
    const [summary, ageing, dead, batches, register, msme, dep, labs, naac] = await Promise.all([
      api<StockSummary>('/v1/inventory/reports/stock-summary'),
      safe(api<Ageing>('/v1/inventory/reports/ageing'), null),
      safe(api<DeadStock>(`/v1/inventory/reports/dead-stock?${q({ days: idle })}`), null),
      safe(api<Batch[]>(`/v1/inventory/batches?${q({ expiring })}`), []),
      safe(api<PurchaseRegister>(`/v1/inventory/reports/purchase-register?${q({ from, to })}`), null),
      safe(api<MsmeDues>('/v1/inventory/reports/msme-dues'), null),
      safe(api<Depreciation>(`/v1/assets/reports/depreciation?${q({ fy })}`), null),
      safe(api<Labs>('/v1/assets/reports/labs'), null),
      safe(api<Naac>(`/v1/assets/reports/naac?${q({ fy })}`), null),
    ]);
    return { summary, ageing, dead, batches, register, msme, dep, labs, naac };
  });
  const header = (
    <PageHeader
      title={t('ipass.reports')}
      subtitle={t('ipass.reportsSub')}
      actions={
        <>
          <LinkButton href="/inventory" variant="outlined">{t('nav.inventory')}</LinkButton>
          <LinkButton href="/ops-reports" variant="outlined">{t('cops.reports')}</LinkButton>
        </>
      }
    />
  );
  if (data.error !== undefined)
    return (
      <>
        {header}
        <ErrorState message={data.error} />
      </>
    );
  const { summary, ageing, dead, batches, register, msme, dep, labs, naac } = data.data;
  const yes = (b: boolean) => (b ? t('ipass.yes') : t('ipass.no'));
  const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
  const panels: Panel[] = [
    {
      id: 'summary',
      title: t('ipass.p.summary'),
      hint: t('ipass.p.summaryHint', { day: fmt.date(summary.asOn) }),
      empty: t('ipass.p.summaryNone'),
      stats: [{ label: t('ipass.s.total'), value: fmt.rupees(summary.totalPaise) }, { label: t('ipass.s.items'), value: fmt.number(summary.lines.length) }, ...summary.byCategory.slice(0, 3).map((c) => ({ label: c.name, value: fmt.rupees(c.valuePaise) }))],
      columns: [
        { key: 'store', label: t('ipass.c.store') },
        { key: 'sku', label: t('ipass.c.sku') },
        { key: 'item', label: t('ipass.c.item') },
        { key: 'category', label: t('ipass.c.category') },
        { key: 'qty', label: t('ipass.c.qty'), kind: 'num' },
        { key: 'avgCostPaise', label: t('ipass.c.avgCost'), kind: 'paise' },
        { key: 'valuePaise', label: t('ipass.c.value'), kind: 'paise' },
      ],
      rows: summary.lines.map((l) => ({ id: `${l.storeId}:${l.itemId}`, ...l })),
      downloads: [{ label: 'Excel', href: '/api/download?kind=ops-report&id=inventory.stockRegister&format=xlsx' }],
    },
    {
      id: 'expiry',
      title: t('ipass.p.expiry'),
      hint: t('ipass.p.expiryHint', { days: expiring }),
      empty: t('ipass.p.expiryNone'),
      columns: [
        { key: 'item', label: t('ipass.c.item') },
        { key: 'store', label: t('ipass.c.store') },
        { key: 'batchNo', label: t('ipass.c.batch') },
        { key: 'expiryOn', label: t('ipass.c.expiry'), kind: 'date' },
        { key: 'qtyLeft', label: t('ipass.c.qty'), kind: 'num' },
        { key: 'valuePaise', label: t('ipass.c.value'), kind: 'paise' },
        { key: 'state', label: t('ipass.c.state'), kind: 'pill', words: { expired: t('ipass.state.expired'), expiring: t('ipass.state.expiring'), good: t('ipass.state.good'), no_expiry: t('ipass.state.no_expiry') }, tones: { expired: 'danger', expiring: 'warning', good: 'success', no_expiry: 'neutral' } },
      ],
      rows: batches as unknown as Record<string, unknown>[],
    },
    {
      id: 'ageing',
      title: t('ipass.p.ageing'),
      hint: t('ipass.p.ageingHint'),
      empty: t('ipass.p.summaryNone'),
      stats: (ageing?.buckets ?? []).map((b) => ({ label: t(`ipass.bucket.${b as '0-30'}`), value: fmt.rupees(ageing!.totals[b] ?? 0) })),
      columns: [
        { key: 'item', label: t('ipass.c.item') },
        { key: 'store', label: t('ipass.c.store') },
        { key: 'oldestOn', label: t('ipass.c.received'), kind: 'date' },
        ...(ageing?.buckets ?? []).map((b) => ({ key: `b_${b}`, label: t(`ipass.bucket.${b as '0-30'}`), kind: 'paise' as const })),
        { key: 'valuePaise', label: t('ipass.c.value'), kind: 'paise' },
      ],
      rows: (ageing?.lines ?? []).map((l) => ({ id: `${l.store}:${l.itemId}`, ...l, ...Object.fromEntries(Object.entries(l.buckets).map(([b, v]) => [`b_${b}`, v.valuePaise])) })),
    },
    {
      id: 'dead',
      title: t('ipass.p.dead'),
      hint: t('ipass.p.deadHint', { days: dead?.days ?? idle }),
      empty: t('ipass.p.deadNone'),
      stats: [{ label: t('ipass.c.value'), value: fmt.rupees(dead?.totalPaise ?? 0) }],
      columns: [
        { key: 'item', label: t('ipass.c.item') },
        { key: 'store', label: t('ipass.c.store') },
        { key: 'qty', label: t('ipass.c.qty'), kind: 'num' },
        { key: 'lastOut', label: t('ipass.c.lastOut'), kind: 'date' },
        { key: 'idleDays', label: t('ipass.c.idle'), kind: 'num' },
        { key: 'valuePaise', label: t('ipass.c.value'), kind: 'paise' },
      ],
      rows: (dead?.lines ?? []).map((l) => ({ id: `${l.storeId}:${l.itemId}`, ...l })),
    },
    {
      id: 'register',
      title: t('ipass.p.register'),
      hint: t('ipass.p.registerHint', { from: fmt.date(from), to: fmt.date(to) }),
      empty: t('ipass.p.registerNone'),
      stats: register ? [{ label: t('ipass.c.taxable'), value: fmt.rupees(register.totals.taxablePaise) }, { label: t('ipass.s.tax'), value: fmt.rupees(register.totals.cgstPaise + register.totals.sgstPaise + register.totals.igstPaise) }, { label: t('ipass.c.total'), value: fmt.rupees(register.totals.amountPaise) }] : [],
      columns: [
        { key: 'on', label: t('ipass.c.date'), kind: 'date' },
        { key: 'invoiceNo', label: t('ipass.c.invoice') },
        { key: 'vendor', label: t('ipass.c.vendor') },
        { key: 'gstin', label: t('ipass.c.gstin') },
        { key: 'taxablePaise', label: t('ipass.c.taxable'), kind: 'paise' },
        { key: 'cgstPaise', label: t('ipass.c.cgst'), kind: 'paise' },
        { key: 'sgstPaise', label: t('ipass.c.sgst'), kind: 'paise' },
        { key: 'igstPaise', label: t('ipass.c.igst'), kind: 'paise' },
        { key: 'amountPaise', label: t('ipass.c.total'), kind: 'paise' },
      ],
      rows: register?.lines ?? [],
      downloads: [{ label: 'Excel', href: `/api/download?kind=ops-report&id=procurement.register&format=xlsx&from=${from}&to=${to}` }],
    },
    {
      id: 'hsn',
      title: t('ipass.p.hsn'),
      empty: t('ipass.p.registerNone'),
      columns: [
        { key: 'hsn', label: t('ipass.c.hsn') },
        { key: 'gstRatePct', label: t('ipass.c.gst'), kind: 'num' },
        { key: 'qty', label: t('ipass.c.qty'), kind: 'num' },
        { key: 'taxablePaise', label: t('ipass.c.taxable'), kind: 'paise' },
        { key: 'taxPaise', label: t('ipass.s.tax'), kind: 'paise' },
      ],
      rows: (register?.hsn ?? []).map((h) => ({ id: `${h.hsn}:${h.gstRatePct}`, ...h })),
    },
    {
      id: 'msme',
      title: t('ipass.p.msme'),
      hint: t('ipass.p.msmeHint'),
      empty: t('ipass.p.msmeNone'),
      stats: [{ label: t('ipass.s.overdue'), value: fmt.rupees(msme?.overduePaise ?? 0) }],
      columns: [
        { key: 'invoiceNo', label: t('ipass.c.invoice') },
        { key: 'vendor', label: t('ipass.c.vendor') },
        { key: 'udyam', label: t('ipass.c.udyam') },
        { key: 'amountPaise', label: t('ipass.c.total'), kind: 'paise' },
        { key: 'dueOn', label: t('ipass.c.due'), kind: 'date' },
        { key: 'overdueDays', label: t('ipass.c.overdue'), kind: 'num' },
      ],
      rows: msme?.lines ?? [],
    },
    {
      id: 'companies',
      title: t('ipass.p.companies'),
      hint: t('ipass.p.companiesHint', { fy }),
      empty: t('ipass.p.none'),
      stats: dep ? [{ label: t('ipass.s.depCa'), value: fmt.rupees(dep.companiesAct.totals.depreciationPaise) }, { label: t('ipass.s.depIt'), value: fmt.rupees(dep.incomeTaxAct.depreciationPaise) }] : [],
      columns: [
        { key: 'tag', label: t('ipass.c.tag') },
        { key: 'name', label: t('ipass.c.asset') },
        { key: 'putToUseOn', label: t('ipass.c.received'), kind: 'date' },
        { key: 'days', label: t('ipass.c.days'), kind: 'num' },
        { key: 'openingPaise', label: t('ipass.c.opening'), kind: 'paise' },
        { key: 'additionPaise', label: t('ipass.c.addition'), kind: 'paise' },
        { key: 'depreciationPaise', label: t('ipass.c.depreciation'), kind: 'paise' },
        { key: 'closingPaise', label: t('ipass.c.closing'), kind: 'paise' },
      ],
      rows: dep?.companiesAct.assets ?? [],
    },
    {
      id: 'it',
      title: t('ipass.p.it'),
      hint: t('ipass.p.itHint'),
      empty: t('ipass.p.none'),
      columns: [
        { key: 'label', label: t('ipass.c.block') },
        { key: 'ratePct', label: t('ipass.c.rate'), kind: 'num' },
        { key: 'openingPaise', label: t('ipass.c.opening'), kind: 'paise' },
        { key: 'additionsFullPaise', label: t('ipass.c.addFull'), kind: 'paise' },
        { key: 'additionsHalfPaise', label: t('ipass.c.addHalf'), kind: 'paise' },
        { key: 'deletionsPaise', label: t('ipass.c.sales'), kind: 'paise' },
        { key: 'depreciationPaise', label: t('ipass.c.depreciation'), kind: 'paise' },
        { key: 'closingPaise', label: t('ipass.c.closing'), kind: 'paise' },
      ],
      rows: (dep?.incomeTaxAct.blocks ?? []).map((b) => ({ id: b.block, ...b })),
    },
    {
      id: 'labs',
      title: t('ipass.p.labs'),
      hint: t('ipass.p.labsHint'),
      empty: t('ipass.p.labsNone'),
      stats: labs ? [{ label: t('ipass.s.labs'), value: fmt.number(labs.totals.labs) }, { label: t('ipass.s.equipment'), value: fmt.number(labs.totals.equipment) }, { label: t('ipass.c.value'), value: fmt.rupees(labs.totals.costPaise) }] : [],
      columns: [
        { key: 'room', label: t('ipass.c.lab') },
        { key: 'tag', label: t('ipass.c.tag') },
        { key: 'name', label: t('ipass.c.asset') },
        { key: 'makeModel', label: t('ipass.c.make') },
        { key: 'serialNo', label: t('ipass.c.serial') },
        { key: 'costPaise', label: t('ipass.c.value'), kind: 'paise' },
        { key: 'workingWord', label: t('ipass.c.working'), kind: 'pill', words: { [t('ipass.yes')]: t('ipass.yes'), [t('ipass.no')]: t('ipass.no') }, tones: { [t('ipass.yes')]: 'success', [t('ipass.no')]: 'danger' } },
        { key: 'nextServiceOn', label: t('ipass.c.service'), kind: 'date' },
        { key: 'calibrationDueOn', label: t('ipass.c.calibration'), kind: 'date' },
        { key: 'coverWord', label: t('ipass.c.cover') },
      ],
      rows: (labs?.labs ?? []).flatMap((l) => l.equipment.map((e) => ({ ...e, room: l.room, makeModel: [e.make, e.model].filter(Boolean).join(' '), workingWord: yes(e.working), coverWord: t(`ipass.cover.${e.cover}`) }))),
    },
    {
      id: 'naac',
      title: t('ipass.p.naac'),
      hint: t('ipass.p.naacHint', { fy }),
      empty: t('ipass.p.none'),
      stats: naac ? [{ label: t('ipass.s.avg41'), value: pct(naac.average.augmentationPct) }, { label: t('ipass.s.avg44'), value: pct(naac.average.maintenancePct) }] : [],
      columns: [
        { key: 'fiscalYear', label: t('ipass.fy') },
        { key: 'augmentationPaise', label: t('ipass.c.augment'), kind: 'paise' },
        { key: 'maintenancePhysicalPaise', label: t('ipass.c.physical'), kind: 'paise' },
        { key: 'maintenanceAcademicPaise', label: t('ipass.c.academic'), kind: 'paise' },
        { key: 'totalNonSalaryPaise', label: t('ipass.c.nonSalary'), kind: 'paise' },
        { key: 'augmentationPctWord', label: t('ipass.c.augmentPct') },
        { key: 'maintenancePctWord', label: t('ipass.c.maintPct') },
      ],
      rows: (naac?.years ?? []).map((y) => ({ id: y.fiscalYear, ...y, augmentationPctWord: pct(y.augmentationPct), maintenancePctWord: pct(y.maintenancePct) })),
    },
  ];
  return (
    <>
      {header}
      <FormRow component="form" method="get" className="mb-4" aria-label={t('ipass.filters')}>
        <label className="flex flex-col gap-1 text-sm">
          {t('ipass.fy')}
          <Input name="fy" defaultValue={fy} className="w-[120px] bg-card" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('ipass.from')}
          <Input type="date" name="from" defaultValue={from} className="w-[170px] bg-card" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('ipass.to')}
          <Input type="date" name="to" defaultValue={to} className="w-[170px] bg-card" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('ipass.idleDays')}
          <Input type="number" name="idle" defaultValue={idle} className="w-[120px] bg-card" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('ipass.expiringDays')}
          <Input type="number" name="expiring" defaultValue={expiring} className="w-[120px] bg-card" />
        </label>
        <Button type="submit" variant="outline">{t('ipass.apply')}</Button>
      </FormRow>
      <DepthDesk panels={panels} />
    </>
  );
}
