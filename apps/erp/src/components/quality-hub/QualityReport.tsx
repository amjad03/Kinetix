'use client';

import { ReportPage } from '@/components/templates';
import { SelectInput, StatTile, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { reportKey, statusKey, type QhReport } from '@/lib/quality-hub';
import { qhColumns } from './cells';

/**
 * One report of the quality group on the ReportPage template: period and status filters in the URL,
 * the preview table (rows open their record page), print, and PDF / Excel from the API.
 */
export function QualityReport({ report, filters }: { report: QhReport; filters: { from: string; to: string; status: string } }) {
  const i = useI18n();
  const { t, fmt } = i;
  const summary = report.id === 'accreditation.summary';
  // The summary's rows are metrics: show each metric's name rather than its code.
  const rows = summary ? report.rows.map((r) => ({ ...r, area: t(`qh.m.${String(r.area)}` as MessageKey), metric: t(`qh.m.${String(r.metric)}` as MessageKey) })) : report.rows;
  const download = (format: 'pdf' | 'xlsx') => `/api/download?kind=qh-report&id=${report.id}&format=${format}`;
  return (
    <ReportPage
      reportId={`qh.${report.id}`}
      title={t(reportKey(report.id))}
      subtitle={[t(`${reportKey(report.id)}.d` as MessageKey), report.criterion && t('qh.criterion', { c: report.criterion })].filter(Boolean).join(' ')}
      filters={
        <>
          <TextInput className="w-[180px]" type="date" name="from" label={t('qh.from')} defaultValue={filters.from} slotProps={{ inputLabel: { shrink: true } }} />
          <TextInput className="w-[180px]" type="date" name="to" label={t('qh.to')} defaultValue={filters.to} slotProps={{ inputLabel: { shrink: true } }} />
          {report.statuses.length > 0 && (
            <SelectInput className="w-[200px]" name="status" label={t('qh.f.status')} defaultValue={filters.status} empty={t('qh.any')} options={report.statuses.map((s) => ({ value: s, label: t(statusKey(s)) }))} />
          )}
        </>
      }
      summary={!summary && <StatTile label={t('qh.rows')} value={fmt.number(report.rows.length)} />}
      columns={qhColumns(i, report.columns)}
      rows={rows}
      rowId={(r) => r.id}
      rowHref={report.entity ? (r) => `/quality/records/${report.entity}/${r.id}` : undefined}
      exports={{ pdf: download('pdf'), xlsx: download('xlsx') }}
    />
  );
}
