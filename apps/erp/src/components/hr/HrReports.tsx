'use client';
import { ReportPage } from '@/components/templates';
import { SelectInput, StatGrid, StatTile, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { HR_REPORTS, REPORT_FILTERS, type HrReport } from '@/lib/hr-flow';
import { formatRupees } from '@/lib/money';

type Row = HrReport['rows'][number];
const isMoney = (k: string) => k.endsWith('Paise');

/** HR and payroll reports on the ReportPage template; the URL (?kind=&month=&fy=&year=&departmentId=) is the state. */
export function HrReports({ report, departments }: { report: HrReport; departments: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const f = report.filters;
  const need = REPORT_FILTERS[report.kind];
  const fys = Array.from({ length: 6 }, (_, i) => f.fy + 1 - i);
  const totals = report.columns.filter(isMoney).slice(0, 4).map((k) => ({ k, v: report.rows.reduce((a, r) => a + Number(r[k] ?? 0), 0) }));
  return (
    <ReportPage<Row>
      reportId={`hr.${report.kind}`}
      title={t(`hf.rep.${report.kind}` as MessageKey)}
      subtitle={t('hf.rep.subtitle')}
      filters={
        <>
          <SelectInput name="kind" label={t('hf.rep.report')} defaultValue={report.kind} options={HR_REPORTS.map((k) => ({ value: k, label: t(`hf.rep.${k}` as MessageKey) }))} />
          {need.includes('month') && <TextInput name="month" type="month" label={t('pay.month')} defaultValue={f.month} slotProps={{ inputLabel: { shrink: true } }} />}
          {need.includes('fy') && <SelectInput name="fy" label={t('hf.rep.fy')} defaultValue={String(f.fy)} options={fys.map((y) => ({ value: String(y), label: `${y}-${String(y + 1).slice(2)}` }))} />}
          {need.includes('year') && <TextInput name="year" type="number" label={t('hf.rep.year')} defaultValue={String(f.year)} />}
          <SelectInput name="departmentId" label={t('hr.f.department')} defaultValue={f.departmentId ?? ''} empty={t('hf.rep.allDepartments')} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
        </>
      }
      summary={
        <StatGrid min={160}>
          <StatTile label={t('hf.rep.rows')} value={report.rows.length} />
          {totals.map((x) => (
            <StatTile key={x.k} label={t(`hf.col.${x.k}` as MessageKey)} value={formatRupees(x.v)} />
          ))}
        </StatGrid>
      }
      columns={report.columns.map((k, i) => ({
        id: k,
        header: t(`hf.col.${k}` as MessageKey),
        rowHeader: i === 0,
        align: isMoney(k) || typeof report.rows[0]?.[k] === 'number' ? ('right' as const) : undefined,
        sort: (r: Row) => r[k] ?? '',
        cell: (r: Row) => (isMoney(k) ? formatRupees(Number(r[k] ?? 0)) : k === 'status' ? t(`hf.rep.status.${r[k]}` as MessageKey) : (r[k] ?? '–')),
        csv: (r: Row) => (isMoney(k) ? (Number(r[k] ?? 0) / 100).toFixed(2) : String(r[k] ?? '')),
      }))}
      rows={report.rows}
      rowId={(r) => report.columns.map((k) => String(r[k] ?? '')).join('|')}
    />
  );
}
