import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { HrList } from '@/components/hr/HrList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe } from '@/lib/depth-ui';
import { loadRecords } from '@/lib/records-server';

interface TaxProfile {
  tan: string;
  pan: string;
  deductorName: string;
  deductorAddress: string;
  responsiblePerson: string;
  responsibleDesignation: string;
}
interface TdsSummary {
  fy: string;
  months: { month: string; quarter: string; deductedPaise: number; depositedPaise: number; shortPaise: number }[];
  shortMonths: string[];
}

/** The financial year (April to March) that today falls in, as "2026-27". */
function currentFy(now = new Date()): string {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.pay.title') };
}

/** Overtime, arrears and recoveries; the tax profile, challans and Form 16. */
export default async function PayrollAdjustmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('payroll');
  const { t } = await getI18n();
  const sp = await searchParams;
  const fyParam = typeof sp.fy === 'string' ? sp.fy : '';
  const fy = /^\d{4}-\d{2}$/.test(fyParam) ? fyParam : currentFy();
  const view = sp.view === 'tax' ? 'tax' : 'adjustments';
  const list = await loadRecords(view === 'tax' ? 'tds-challans' : 'payroll-adjustments', sp);
  const data = await load(async () => {
    const [adjustments, staff, profile, summary] = await Promise.all([
      api<Record<string, unknown>[]>('/v1/hr/payroll/adjustments'),
      safe(api<{ id: string; fullName: string; employeeCode: string | null }[]>('/v1/hr/payroll/staff-options'), []),
      safe(api<TaxProfile | null>('/v1/hr/payroll/tax-profile'), null),
      safe(api<TdsSummary>(`/v1/hr/payroll/tds-summary?fy=${fy}`), null),
    ]);
    return { adjustments, staff, profile, summary };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { adjustments, staff, profile, summary } = data.data;
  const people = opt(staff, (s) => s.id, (s) => `${s.fullName}${s.employeeCode ? ` (${s.employeeCode})` : ''}`);

  const panels: Panel[] = [
    {
      id: 'arrears',
      title: t('dx.pay.arrears'),
      hint: t('dx.pay.adjustmentsHint'),
      empty: t('dx.pay.noAdjustments'),
      columns: [
        { key: 'fullName', label: t('dx.c.name') },
        { key: 'payMonth', label: t('dx.pay.month') },
        { key: 'amountPaise', label: t('dx.c.amount'), kind: 'paise' },
        { key: 'reason', label: t('dx.c.reason') },
      ],
      rows: adjustments.filter((r) => r.kind === 'arrear'),
      forms: [
        {
          id: 'arrears',
          title: t('dx.pay.arrears'),
          submit: t('dx.pay.work'),
          path: '/v1/hr/payroll/adjustments/revision-arrears',
          fields: [
            { name: 'userId', label: t('dx.c.name'), type: 'select', options: people, required: true },
            { name: 'payMonth', label: t('dx.pay.month'), type: 'text', required: true, hint: t('dx.pay.monthHint') },
          ],
        },
      ],
    },
    {
      id: 'tax',
      title: `${t('dx.pay.tax')} ${fy}`,
      hint: profile ? t('dx.pay.profileLine', { name: profile.deductorName, tan: profile.tan, pan: profile.pan }) : t('dx.pay.noProfile'),
      empty: t('dx.pay.noSummary'),
      stats: summary ? [{ label: t('dx.pay.short'), value: summary.shortMonths.length ? summary.shortMonths.join(', ') : t('dx.none') }] : [],
      columns: [
        { key: 'month', label: t('dx.pay.month') },
        { key: 'quarter', label: t('dx.pay.quarter') },
        { key: 'deductedPaise', label: t('dx.pay.deducted'), kind: 'paise' },
        { key: 'depositedPaise', label: t('dx.pay.deposited'), kind: 'paise' },
        { key: 'shortPaise', label: t('dx.pay.short'), kind: 'paise' },
      ],
      rows: (summary?.months ?? []).filter((m) => m.deductedPaise > 0 || m.depositedPaise > 0).map((m) => ({ ...m, id: m.month })),
      forms: [
        {
          id: 'profile',
          title: t('dx.pay.profile'),
          submit: t('dx.save'),
          method: 'PUT',
          path: '/v1/hr/payroll/tax-profile',
          fields: [
            { name: 'tan', label: t('dx.pay.tan'), type: 'text', initial: profile?.tan ?? '', required: true },
            { name: 'pan', label: t('dx.pay.pan'), type: 'text', initial: profile?.pan ?? '', required: true },
            { name: 'deductorName', label: t('dx.pay.deductor'), type: 'text', initial: profile?.deductorName ?? '', required: true },
            { name: 'deductorAddress', label: t('dx.c.address'), type: 'text', initial: profile?.deductorAddress ?? '' },
            { name: 'responsiblePerson', label: t('dx.pay.responsible'), type: 'text', initial: profile?.responsiblePerson ?? '' },
            { name: 'responsibleDesignation', label: t('dx.pay.designation'), type: 'text', initial: profile?.responsibleDesignation ?? '' },
          ],
        },
      ],
    },
    {
      id: 'form16',
      title: `${t('dx.pay.form16')} ${fy}`,
      hint: t('dx.pay.form16Hint'),
      empty: t('dx.pay.noStaff'),
      columns: [
        { key: 'fullName', label: t('dx.c.name') },
        { key: 'employeeCode', label: t('dx.c.code') },
        { key: 'id', label: t('dx.pay.form16'), kind: 'link', href: `/api/download?kind=form16&id={id}&fy=${fy}`, words: { link: t('dx.download') } },
      ],
      rows: staff,
    },
  ];

  return (
    <>
      <PageHeader title={t('dx.pay.title')} subtitle={t('dx.pay.subtitle')} />
      <LinkTabs
        value={view}
        label={t('dx.pay.title')}
        items={[
          { value: 'adjustments', href: '/payroll/adjustments', label: t('rk.entity.payroll-adjustments') },
          { value: 'tax', href: '/payroll/adjustments?view=tax', label: t('dx.pay.tax') },
        ]}
      />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity={view === 'tax' ? 'tds-challans' : 'payroll-adjustments'} data={list.data} extraParams={{ view }} />}
      <div className="mt-6">
        <DepthDesk panels={view === 'tax' ? panels.filter((p) => p.id !== 'arrears') : panels.filter((p) => p.id === 'arrears')} />
      </div>
    </>
  );
}
