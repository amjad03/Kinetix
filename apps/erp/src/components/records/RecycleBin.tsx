'use client';

import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { purgeFromBin, restoreFromBin, saveBinRetention } from '@/app/(dashboard)/records-actions';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, EmptyState, FormRow, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { listSearch, type BinEntry, type BinPage, type BinResult, type BulkReport, type ListState } from '@/lib/records';
import { BulkReportDialog } from './BulkReportDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { entityText, moduleText } from './text';

const asReport = (op: 'action', results: BinResult[]): BulkReport => ({
  op,
  atomic: false,
  committed: true,
  total: results.length,
  succeeded: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  rows: results,
});

/**
 * The recycle bin: everything deleted through the record kit, newest first, by module. Restore brings a record back
 * with what was deleted along with it (or says what must be restored first); purge removes it for good. Entries go
 * by themselves after the retention period, which the principal sets here.
 */
export function RecycleBin({ data, state, canSettings }: { data: BinPage; state: ListState; canSettings: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNav] = useTransition();
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState<{ ids: string[]; label?: string } | null>(null);
  const [report, setReport] = useState<{ title: string; report: BulkReport } | null>(null);
  const [days, setDays] = useState(String(data.retentionDays));

  const go = (next: Partial<ListState>) => {
    const qs = listSearch({ ...state, ...next }).toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const restore = (ids: string[]) =>
    start(async () => {
      const res = await restoreFromBin(ids);
      if (!res.ok) return toast.error(res.error);
      const r = res.data.results;
      if (r.length === 1 && r[0].ok) toast.success(t('rk.restored', { name: r[0].label }));
      else setReport({ title: t('rk.bin.restore'), report: asReport('action', r) });
    });
  const purge = (ids: string[]) =>
    start(async () => {
      const res = await purgeFromBin(ids);
      setConfirm(null);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('rk.bin.purged', { n: res.data.results.filter((x) => x.ok).length }));
    });
  const saveDays = () =>
    start(async () => {
      const res = await saveBinRetention(Number(days));
      if (!res.ok) return toast.error(res.error);
      toast.success(t('rk.bin.retentionSaved', { n: res.data.retentionDays }));
    });

  const columns: Column<BinEntry>[] = [
    {
      id: 'label',
      header: t('rk.bin.record'),
      rowHeader: true,
      hideable: false,
      cell: (r) => (
        <span className="grid">
          <span className="font-[550]">{r.label}</span>
          <span className="text-xs text-muted-foreground">{entityText(t, r.entity)}</span>
        </span>
      ),
    },
    { id: 'module', header: t('rk.bin.module'), cell: (r) => moduleText(t, r.module), hideBelow: 'md' },
    { id: 'by', header: t('rk.bin.deletedBy'), cell: (r) => r.deletedBy?.name ?? '—', hideBelow: 'lg' },
    { id: 'at', header: t('rk.bin.deletedAt'), cell: (r) => <time dateTime={r.deletedAt}>{fmt.dateTime(r.deletedAt)}</time> },
    {
      id: 'purge',
      header: t('rk.bin.purgeOn'),
      hideBelow: 'sm',
      cell: (r) => {
        const daysLeft = Math.ceil((Date.parse(r.purgeOn) - Date.now()) / 86_400_000);
        return <StatusPill tone={daysLeft <= 7 ? 'warning' : 'neutral'}>{fmt.date(r.purgeOn.slice(0, 10))}</StatusPill>;
      },
    },
    { id: 'rows', header: t('rk.bin.rows'), align: 'right', hideBelow: 'lg', cell: (r) => fmt.number(r.rowCount) },
  ];

  return (
    <div className="grid gap-5">
      <DataTable<BinEntry>
        testId="recycle-bin"
        label={t('rk.bin.title')}
        columns={columns}
        rows={data.rows}
        rowId={(r) => r.id}
        selectable
        selectAllMatching={false}
        filters={[
          { id: 'module', label: t('rk.bin.module'), options: data.modules.map((m) => ({ value: m, label: moduleText(t, m) })) },
          { id: 'entity', label: t('rk.bin.kind'), options: data.entities.filter((e) => !state.filters.module || e.module === state.filters.module).map((e) => ({ value: e.key, label: entityText(t, e.key) })) },
        ]}
        empty={<EmptyState icon={<Archive />} title={t('rk.bin.empty')} testId="bin-empty">{t('rk.bin.emptyHelp', { n: data.retentionDays })}</EmptyState>}
        rowActions={() => [
          { id: 'restore', label: t('rk.bin.restore'), icon: <RotateCcw />, onSelect: (r) => restore([r.id]) },
          { id: 'purge', label: t('rk.bin.purge'), icon: <Trash2 />, tone: 'danger', separator: true, onSelect: (r) => setConfirm({ ids: [r.id], label: r.label }) },
        ]}
        bulkActions={[
          { id: 'restore', label: t('rk.bin.restore'), icon: <RotateCcw />, onClick: (rows) => restore(rows.map((r) => r.id)) },
          { id: 'purge', label: t('rk.bin.purge'), icon: <Trash2 />, tone: 'danger', onClick: (rows) => setConfirm({ ids: rows.map((r) => r.id) }) },
        ]}
        server={{
          total: data.total,
          page: data.page,
          pageSize: data.pageSize,
          query: state.q,
          filters: state.filters,
          sort: null,
          pending: navigating || busy,
          onChange: (n) => go({ ...(n.query !== undefined && { q: n.query }), ...(n.filters && { filters: Object.fromEntries(Object.entries(n.filters).filter(([, v]) => v)) }), ...(n.page && { page: n.page }), ...(n.pageSize && { pageSize: n.pageSize }) }),
        }}
      />

      {canSettings && (
        <Card title={t('rk.bin.retention')} subtitle={t('rk.bin.retentionHelp')}>
          <FormRow>
            <TextInput label={t('rk.bin.retentionDays')} type="number" value={days} onChange={(e) => setDays(e.target.value)} inputProps={{ min: 1, max: 3650, 'data-testid': 'retention-days' }} />
            <Button onClick={saveDays} disabled={busy || !/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 3650}>
              {t('rk.save')}
            </Button>
          </FormRow>
        </Card>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.label ? t('rk.bin.purgeOne', { name: confirm.label }) : t('rk.bin.purgeMany', { n: confirm.ids.length })}
          confirmLabel={t('rk.bin.purge')}
          tone="danger"
          typeToConfirm={confirm.ids.length > 1 ? String(confirm.ids.length) : undefined}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => purge(confirm.ids)}
        >
          <p className="m-0">{t('rk.bin.purgeBody')}</p>
        </ConfirmDialog>
      )}
      {report && <BulkReportDialog title={report.title} report={report.report} onClose={() => setReport(null)} />}
    </div>
  );
}
