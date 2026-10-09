import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

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
export default async function PayrollAdjustmentsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  await requireSection('payroll');
  const { t } = await getI18n();
  const sp = await searchParams;
  const fy = /^\d{4}-\d{2}$/.test(sp.fy ?? '') ? (sp.fy as string) : currentFy();
  const data = await load(async () => {
    const [adjustments, staff, profile, challans, summary] = await Promise.all([
      api<Record<string, unknown>[]>('/v1/hr/payroll/adjustments'),
      safe(api<{ id: string; fullName: string; employeeCode: string | null }[]>('/v1/hr/payroll/staff-options'), []),
      safe(api<TaxProfile | null>('/v1/hr/payroll/tax-profile'), null),
      safe(api<Record<string, unknown>[]>(`/v1/hr/payroll/challans?fy=${fy}`), []),
      safe(api<TdsSummary>(`/v1/hr/payroll/tds-summary?fy=${fy}`), null),
    ]);
    return { adjustments, staff, profile, challans, summary };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { adjustments, staff, profile, challans, summary } = data.data;
  const words = stateWords(t);
  const people = opt(staff, (s) => s.id, (s) => `${s.fullName}${s.employeeCode ? ` (${s.employeeCode})` : ''}`);
  const kinds = ['overtime', 'arrear', 'bonus', 'recovery'] as const;
  const kindWords = Object.fromEntries(kinds.map((k) => [k, t(`dx.pay.k.${k}`)]));

  const panels: Panel[] = [
    {
      id: 'adjustments',
      title: t('dx.pay.adjustments'),
      hint: t('dx.pay.adjustmentsHint'),
      empty: t('dx.pay.noAdjustments'),
      columns: [
        { key: 'fullName', label: t('dx.c.name') },
        { key: 'kind', label: t('dx.c.kind'), kind: 'pill', words: kindWords },
        { key: 'payMonth', label: t('dx.pay.month') },
        { key: 'hours', label: t('dx.pay.hours'), kind: 'num' },
        { key: 'amountPaise', label: t('dx.c.amount'), kind: 'paise' },
        { key: 'reason', label: t('dx.c.reason') },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
      ],
      rows: adjustments,
      actions: [
        { label: t('dx.approve'), path: '/v1/hr/payroll/adjustments/{id}/decide', body: { approve: true }, show: { key: 'status', is: ['pending'] } },
        { label: t('dx.reject'), path: '/v1/hr/payroll/adjustments/{id}/decide', body: { approve: false }, show: { key: 'status', is: ['pending'] } },
      ],
      forms: [
        {
          id: 'adjustment',
          title: t('dx.pay.add'),
          submit: t('dx.add'),
          path: '/v1/hr/payroll/adjustments',
          fields: [
            { name: 'userId', label: t('dx.c.name'), type: 'select', options: people, required: true },
            { name: 'kind', label: t('dx.c.kind'), type: 'select', options: opt([...kinds], (k) => k, (k) => kindWords[k]), initial: 'overtime', required: true },
            { name: 'payMonth', label: t('dx.pay.month'), type: 'text', required: true, hint: t('dx.pay.monthHint') },
            { name: 'hours', label: t('dx.pay.hours'), type: 'number', hint: t('dx.pay.hoursHint') },
            { name: 'amountPaise', label: t('dx.c.amount'), type: 'paise', hint: t('dx.pay.amountHint') },
            { name: 'reason', label: t('dx.c.reason'), type: 'text', required: true },
          ],
        },
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
      empty: t('dx.pay.noChallans'),
      stats: summary ? [{ label: t('dx.pay.short'), value: summary.shortMonths.length ? summary.shortMonths.join(', ') : t('dx.none') }] : [],
      columns: [
        { key: 'payMonth', label: t('dx.pay.month') },
        { key: 'section', label: t('dx.pay.section') },
        { key: 'bsrCode', label: t('dx.pay.bsr') },
        { key: 'challanSerial', label: t('dx.pay.serial') },
        { key: 'depositedOn', label: t('dx.pay.depositedOn'), kind: 'date' },
        { key: 'tdsPaise', label: t('dx.pay.tds'), kind: 'paise' },
      ],
      rows: challans,
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
        {
          id: 'challan',
          title: t('dx.pay.addChallan'),
          submit: t('dx.add'),
          path: '/v1/hr/payroll/challans',
          fields: [
            { name: 'payMonth', label: t('dx.pay.month'), type: 'text', required: true, hint: t('dx.pay.monthHint') },
            { name: 'bsrCode', label: t('dx.pay.bsr'), type: 'text', required: true },
            { name: 'challanSerial', label: t('dx.pay.serial'), type: 'text', required: true },
            { name: 'depositedOn', label: t('dx.pay.depositedOn'), type: 'date', required: true },
            { name: 'tdsPaise', label: t('dx.pay.tds'), type: 'paise', required: true },
          ],
        },
      ],
    },
    {
      id: 'summary',
      title: t('dx.pay.deductedVsDeposited'),
      empty: t('dx.pay.noSummary'),
      columns: [
        { key: 'month', label: t('dx.pay.month') },
        { key: 'quarter', label: t('dx.pay.quarter') },
        { key: 'deductedPaise', label: t('dx.pay.deducted'), kind: 'paise' },
        { key: 'depositedPaise', label: t('dx.pay.deposited'), kind: 'paise' },
        { key: 'shortPaise', label: t('dx.pay.short'), kind: 'paise' },
      ],
      rows: (summary?.months ?? []).filter((m) => m.deductedPaise > 0 || m.depositedPaise > 0).map((m) => ({ ...m, id: m.month })),
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
      <DepthDesk panels={panels} />
    </>
  );
}
