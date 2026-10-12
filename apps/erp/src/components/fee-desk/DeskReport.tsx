'use client';

import Link from 'next/link';
import { ReportPage } from '@/components/templates';
import { SelectInput, StatGrid, StatTile, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { fillHref, type ReportSpec, type Row } from '@/lib/fee-desk';
import { useCell, useWord } from './SpecTable';

const MODES = ['cash', 'cheque', 'upi', 'bank_transfer', 'online'];
const CHEQUE = ['received', 'deposited', 'cleared', 'bounced'];

/** A desk report on the ReportPage template: URL filters, totals, the table, print and CSV. */
export function DeskReport({ spec, rows, totals, query, students }: { spec: ReportSpec; rows: Row[]; totals: Record<string, number>; query: Record<string, string>; students?: { id: string; student: string }[] }) {
  const { t } = useI18n();
  const cell = useCell();
  const word = useWord();
  const columns: Column<Row>[] = spec.columns.map((c, i) => ({
    id: c.key,
    header: t(c.label as MessageKey),
    cell: (r) => (i === 0 && spec.href ? <Link className="underline-offset-4 hover:underline" href={fillHref(spec.href, r)}>{cell(c, r[c.key])}</Link> : cell(c, r[c.key])),
    sort: (r) => (c.kind === 'money' || c.kind === 'number' ? Number(r[c.key] ?? 0) : String(r[c.key] ?? '')),
    csv: (r) => (c.kind === 'money' ? Number(r[c.key] ?? 0) / 100 : c.kind === 'status' ? word(r[c.key]) : String(r[c.key] ?? '')),
    align: c.kind === 'money' || c.kind === 'number' ? 'right' : 'left',
    hideBelow: c.hideBelow,
    rowHeader: i === 0,
  }));
  const field = (name: string) => {
    switch (name) {
      case 'from':
      case 'to':
        return <TextInput key={name} name={name} type="date" label={t(`fd.f.${name}` as MessageKey)} defaultValue={query[name] ?? ''} />;
      case 'fy':
        return <TextInput key={name} name={name} label={t('fd.col.year')} placeholder="2026-27" defaultValue={query.fy ?? ''} />;
      case 'minDays':
        return <TextInput key={name} name={name} type="number" label={t('fd.f.minDays')} defaultValue={query.minDays ?? ''} />;
      case 'mode':
        return <SelectInput key={name} name={name} label={t('fd.col.mode')} empty={t('fd.all')} defaultValue={query.mode ?? ''} options={MODES.map((m) => ({ value: m, label: word(m) }))} />;
      case 'status':
        return <SelectInput key={name} name={name} label={t('fd.col.status')} empty={t('fd.all')} defaultValue={query.status ?? ''} options={CHEQUE.map((m) => ({ value: m, label: word(m) }))} />;
      case 'studentId':
        return <SelectInput key={name} name={name} label={t('fd.col.student')} empty={t('fd.pick')} defaultValue={query.studentId ?? ''} options={(students ?? []).map((s) => ({ value: s.id, label: s.student }))} />;
    }
    return null;
  };
  return (
    <ReportPage
      reportId={`fees.${spec.key}`}
      title={t(`fd.rep.${spec.key}` as MessageKey)}
      subtitle={t(`fd.rep.${spec.key}.sub` as MessageKey)}
      filters={<>{spec.filters.map(field)}</>}
      columns={columns}
      rows={rows}
      rowId={(r) => r.id}
      summary={
        spec.totals.length > 0 ? (
          <StatGrid min={180}>
            {spec.totals.map(([key, label, kind]) => (
              <StatTile key={key} label={t(label as MessageKey)} value={cell({ key, label, kind }, totals[key] ?? 0)} />
            ))}
          </StatGrid>
        ) : undefined
      }
    />
  );
}
