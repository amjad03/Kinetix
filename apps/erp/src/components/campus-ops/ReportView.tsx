'use client';

import { ReportPage } from '@/components/templates';
import { SelectInput, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { humanize } from '@/lib/campus-ops';

type Row = Record<string, string | number | null>;

/** A campus-operations register or statement on the ReportPage template; the URL holds the filters. */
export function ReportView({ id, columns, rows, filters, statuses, values }: { id: string; columns: { key: string; label: string }[]; rows: Row[]; filters: string[]; statuses: string[]; values: { from?: string; to?: string; status?: string } }) {
  const { t } = useI18n();
  const tr = (key: string, fallback: string) => {
    const s = t(key as MessageKey);
    return s === key ? fallback : s;
  };
  const cols: Column<Row & { _i: number }>[] = columns.map((c, i) => ({
    id: c.key,
    header: tr(`cops.c.${c.key}`, c.label),
    cell: (r) => (c.key === 'status' && typeof r.status === 'string' ? tr(`cops.s.${r.status}`, humanize(r.status)) : String(r[c.key] ?? '')),
    sort: (r) => r[c.key] ?? '',
    align: typeof rows[0]?.[c.key] === 'number' ? 'right' : 'left',
    rowHeader: i === 0,
  }));
  const base = `/api/download?kind=ops-report&id=${id}`;
  return (
    <ReportPage
      reportId={id}
      title={tr(`cops.r.${id}`, id)}
      subtitle={t('cops.rows', { n: rows.length })}
      filters={
        <>
          {filters.includes('from') && <TextInput type="date" name="from" label={t('cops.from')} defaultValue={values.from ?? ''} slotProps={{ inputLabel: { shrink: true } }} />}
          {filters.includes('to') && <TextInput type="date" name="to" label={t('cops.to')} defaultValue={values.to ?? ''} slotProps={{ inputLabel: { shrink: true } }} />}
          {filters.includes('status') && (
            <SelectInput className="min-w-[180px]" name="status" label={t('cops.status')} defaultValue={values.status ?? ''} empty={t('cops.any')} options={statuses.map((s) => ({ value: s, label: tr(`cops.s.${s}`, humanize(s)) }))} />
          )}
        </>
      }
      columns={cols}
      rows={rows.map((r, i) => ({ ...r, _i: i }))}
      rowId={(r) => String(r._i)}
      exports={{ pdf: `${base}&format=pdf`, xlsx: `${base}&format=xlsx` }}
    />
  );
}
