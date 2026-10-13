'use client';

import { ReportPage } from '@/components/templates';
import { DataTable, SelectInput, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { label, recordHref, show, toneOf, type Kind, type ListRow, type Report, type ReportData, type Row } from '@/lib/exam-office';

/** The register of one kind of exam record; each row opens its record. */
export function RecordList({ kind, rows }: { kind: Kind; rows: ListRow[] }) {
  const { t, fmt } = useI18n();
  const name = label(t, 'xo.k.', kind);
  const columns: Column<ListRow>[] = [
    { id: 'title', header: t('xo.c.title'), rowHeader: true, cell: (r) => <span className="font-medium">{r.title}</span>, sort: (r) => r.title },
    { id: 'ref', header: t('xo.c.ref'), cell: (r) => (kind === 'certificate' && r.ref && !r.ref.includes('/') ? label(t, 'xo.s.', r.ref) : (r.ref ?? '—')), sort: (r) => r.ref ?? '' },
    { id: 'session', header: kind === 'certificate' ? t('xo.c.doc_kind') : t('xo.c.session'), hideBelow: 'md', cell: (r) => (kind === 'certificate' ? label(t, 'xo.s.', r.session ?? '') : (r.session ?? '—')), sort: (r) => r.session ?? '' },
    { id: 'status', header: t('xo.c.status'), cell: (r) => <StatusPill tone={toneOf(r.status)}>{label(t, 'xo.s.', r.status)}</StatusPill>, sort: (r) => r.status, csv: (r) => label(t, 'xo.s.', r.status) },
    { id: 'date', header: t('xo.c.date'), hideBelow: 'sm', cell: (r) => show(t, fmt, r.date, 'date'), sort: (r) => r.date ?? '' },
  ];
  const statuses = [...new Set(rows.map((r) => r.status))];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowId={(r) => r.id}
      label={name}
      exportName={name}
      empty={t('xo.empty')}
      rowHref={(r) => recordHref(kind, r.id)}
      filters={statuses.length > 1 ? [{ id: 'status', label: t('xo.c.status'), options: statuses.map((s) => ({ value: s, label: label(t, 'xo.s.', s) })), match: (r, v) => r.status === v }] : undefined}
    />
  );
}

/** One exam office report on the report template: the session (and the analysis mode) live in the URL. */
export function OfficeReport({ report, data, sessions, sessionId, by }: { report: Report; data: ReportData; sessions: { id: string; name: string }[]; sessionId: string; by: string }) {
  const { t, fmt } = useI18n();
  const rows: (Row & { _row: string })[] = data.rows.map((r, i) => ({ ...r, _row: String(i) }));
  return (
    <ReportPage
      reportId={`exam-office.${report}`}
      title={label(t, 'xo.r.', report)}
      subtitle={sessions.find((s) => s.id === sessionId)?.name ?? t('xo.r.pick')}
      filters={
        <>
          <SelectInput name="sessionId" label={t('xo.session')} defaultValue={sessionId} options={sessions.map((s) => ({ value: s.id, label: s.name }))} className="min-w-[260px]" />
          {report === 'result_analysis' && <SelectInput name="by" label={t('xo.r.by')} defaultValue={by || 'subject'} options={[{ value: 'subject', label: t('xo.r.bySubject') }, { value: 'section', label: t('xo.r.bySection') }, { value: 'topper', label: t('xo.r.byTopper') }]} className="min-w-[180px]" />}
        </>
      }
      columns={data.columns.map((c, i) => ({
        id: c.key,
        header: c.key.startsWith('s_') ? c.key.slice(2) : label(t, 'xo.c.', c.key),
        rowHeader: i === 0,
        cell: (r: (typeof rows)[number]) => (c.format === 'status' && r[c.key] ? <StatusPill tone={toneOf(String(r[c.key]))}>{show(t, fmt, r[c.key], c.format)}</StatusPill> : show(t, fmt, r[c.key], c.format)),
        sort: (r: (typeof rows)[number]) => (typeof r[c.key] === 'string' && /^-?\d+(\.\d+)?$/.test(String(r[c.key])) ? Number(r[c.key]) : (r[c.key] as string | number | null) ?? ''),
        csv: (r: (typeof rows)[number]) => show(t, fmt, r[c.key], c.format),
      }))}
      rows={rows}
      rowId={(r) => r._row}
    />
  );
}
