'use client';

import { useState } from 'react';
import type { MessageKey } from '@/i18n/messages';
import { ReportPage } from '@/components/templates';
import { SelectInput, StatusPill, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { REPORT_FILTERS, statusTone, type Directory, type ReportData, type ReportKind } from '@/lib/academics';

type Row = ReportData['rows'][number] & { _i: number };
const STATUS_COLS = new Set(['status']);
const PCT_COLS = new Set(['percent', 'effective', 'fill']);

/** One academics report: URL filters, the API's rows as a table, print and PDF / Excel from the API. */
export function AcademicReport({ kind, data, q, directory }: { kind: ReportKind; data: ReportData; q: Record<string, string>; directory: Directory }) {
  const { t, fmt } = useI18n();
  const [by, setBy] = useState(q.by ?? 'class');
  const f = REPORT_FILTERS[kind];
  const sections = directory.sections.map((s) => ({ value: s.id, label: s.name }));
  const targets = by === 'teacher' ? directory.teachers.map((x) => ({ value: x.id, label: x.name })) : by === 'room' ? directory.rooms.map((x) => ({ value: x.id, label: x.name })) : sections;
  const date = { slotProps: { inputLabel: { shrink: true } } };
  const filters = (
    <>
      {f.includes('date') && <TextInput type="date" name="date" label={t('acad.col.date')} defaultValue={q.date ?? ''} {...date} />}
      {f.includes('month') && <TextInput type="month" name="month" label={t('acad.month')} defaultValue={q.month ?? ''} {...date} />}
      {f.includes('from') && <TextInput type="date" name="from" label={t('acad.from')} defaultValue={q.from ?? ''} {...date} />}
      {f.includes('to') && <TextInput type="date" name="to" label={t('acad.to')} defaultValue={q.to ?? ''} {...date} />}
      {f.includes('sectionId') && <SelectInput className="min-w-[200px]" name="sectionId" label={t('acad.col.section')} defaultValue={q.sectionId ?? ''} options={sections} empty={kind === 'marks-register' ? undefined : t('acad.all')} />}
      {f.includes('by') && <SelectInput className="min-w-[160px]" name="by" label={t('acad.by')} value={by} onChange={(e) => setBy(e.target.value)} options={['class', 'teacher', 'room'].map((v) => ({ value: v, label: t(`acad.by.${v}` as MessageKey) }))} />}
      {f.includes('id') && <SelectInput key={by} className="min-w-[220px]" name="id" label={t(`acad.by.${by}` as MessageKey)} defaultValue={by === (q.by ?? 'class') ? (q.id ?? '') : ''} options={targets} />}
    </>
  );
  const columns: Column<Row>[] = data.columns.map((c) => ({
    id: c.key,
    header: c.label ?? t(`acad.col.${c.key}` as MessageKey),
    cell: (r: Row) => {
      const v = r[c.key];
      if (STATUS_COLS.has(c.key) && typeof v === 'string' && v) return <StatusPill tone={statusTone(v)}>{t(`acad.status.${v}` as MessageKey)}</StatusPill>;
      if (v === null || v === undefined || v === '') return '—';
      if (PCT_COLS.has(c.key) && typeof v === 'number') return `${fmt.number(v)}%`;
      return typeof v === 'number' ? fmt.number(v) : v;
    },
    sort: (r: Row) => r[c.key] ?? '',
    align: typeof data.rows[0]?.[c.key] === 'number' ? ('right' as const) : undefined,
  }));
  const rows: Row[] = data.rows.map((r, i) => ({ ...r, _i: i }));
  const short = data.rows.filter((r) => r.status === 'short' || r.status === 'over').length;
  return (
    <ReportPage
      reportId={`academics.${kind}`}
      title={t(`acad.report.${kind}` as MessageKey)}
      subtitle={t(`acad.report.${kind}.help` as MessageKey)}
      filters={filters}
      columns={columns}
      rows={rows}
      rowId={(r) => String(r._i)}
      exports={{ pdf: `/api/download?kind=acad-report&report=${kind}&format=pdf`, xlsx: `/api/download?kind=acad-report&report=${kind}&format=xlsx` }}
      summary={
        <p className="text-sm text-muted-foreground">
          {t('acad.rows', { n: fmt.number(data.rows.length) })}
          {short > 0 ? ` · ${t('acad.flagged', { n: fmt.number(short) })}` : ''}
        </p>
      }
    />
  );
}
