'use client';

import { Archive, Download, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { deleteDataExport, requestDataExport } from '@/app/(dashboard)/settings/access-actions';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, Dialog, EmptyState, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { exportBusy, formatBytes, type DataExport } from '@/lib/governance-access';

const TONE = { queued: 'info', running: 'live', ready: 'success', failed: 'danger', expired: 'neutral' } as const;

/** Settings > Backups and export: make a full export of the institution's data, download it within seven days, or delete it. */
export function DataExports({ rows }: { rows: DataExport[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState<DataExport | null>(null);
  const working = exportBusy(rows);

  // While an export is being made, look again every few seconds.
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [working, router]);

  const request = () =>
    start(async () => {
      const res = await requestDataExport(note);
      if (!res.ok) return toast.error(res.error);
      setNote('');
      toast.success(t('ga.export.requested'));
      router.refresh();
    });
  const remove = (r: DataExport) =>
    start(async () => {
      const res = await deleteDataExport(r.id);
      setDeleting(null);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ga.export.deleted'));
      router.refresh();
    });

  const columns: Column<DataExport>[] = [
    { id: 'when', header: t('ga.export.col.when'), rowHeader: true, sort: (r) => r.createdAt, cell: (r) => <span className="whitespace-nowrap">{fmt.dateTime(r.createdAt)}</span> },
    { id: 'status', header: t('ga.export.col.status'), sort: (r) => r.status, cell: (r) => <StatusPill tone={TONE[r.status]}>{t(`ga.export.status.${r.status}` as MessageKey)}</StatusPill> },
    { id: 'by', header: t('ga.export.col.by'), hideBelow: 'sm', sort: (r) => r.requestedBy ?? '', cell: (r) => r.requestedBy ?? '' },
    { id: 'note', header: t('ga.export.col.note'), hideBelow: 'md', cell: (r) => r.note || <span className="text-muted-foreground">—</span> },
    {
      id: 'size',
      header: t('ga.export.col.contents'),
      hideBelow: 'sm',
      cell: (r) => (r.status === 'ready' ? t('ga.export.contents', { tables: fmt.number(r.tableCount ?? 0), rows: fmt.number(r.rowCount ?? 0), size: formatBytes(r.sizeBytes) }) : r.status === 'failed' ? <span className="text-red-ink">{r.error}</span> : ''),
    },
    { id: 'expires', header: t('ga.export.col.expires'), hideBelow: 'md', cell: (r) => (r.status === 'ready' && r.expiresAt ? fmt.relative(r.expiresAt) : '') },
    {
      id: 'actions',
      header: t('ga.export.col.actions'),
      csv: false,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.status === 'ready' && (
            <Button asChild size="sm" variant="outline" className="h-8">
              <a href={`/api/export?path=${encodeURIComponent(`/v1/admin/data-exports/${r.id}/download`)}`} data-testid="export-download">
                <Download />
                {t('ga.export.download')}
              </a>
            </Button>
          )}
          {r.status !== 'queued' && r.status !== 'running' && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setDeleting(r)} aria-label={t('ga.export.delete')}>
              <Trash2 />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card title={t('ga.export.new')} subtitle={t('ga.export.newHelp')}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <TextInput label={t('ga.export.note')} value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder={t('ga.export.notePh')} fullWidth />
          </div>
          <Button className="h-9" onClick={request} disabled={busy || working} data-testid="export-request">
            <Archive />
            {working ? t('ga.export.working') : t('ga.export.make')}
          </Button>
        </div>
        <ul className="m-0 mt-4 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
          <li>{t('ga.export.point.contents')}</li>
          <li>{t('ga.export.point.secrets')}</li>
          <li>{t('ga.export.point.keep')}</li>
        </ul>
      </Card>
      <DataTable
        label={t('ga.export.title')}
        columns={columns}
        rows={rows}
        rowId={(r) => r.id}
        testId="data-exports"
        empty={
          <EmptyState icon={<Archive />} title={t('ga.export.none')}>
            {t('ga.export.noneBody')}
          </EmptyState>
        }
      />
      {deleting && (
        <Dialog
          title={t('ga.export.deleteTitle')}
          onClose={() => setDeleting(null)}
          busy={busy}
          actions={
            <>
              <Button variant="outline" className="h-9" onClick={() => setDeleting(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" className="h-9" onClick={() => remove(deleting)} disabled={busy}>
                {t('ga.export.delete')}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">{t('ga.export.deleteBody', { when: fmt.dateTime(deleting.createdAt) })}</p>
        </Dialog>
      )}
    </div>
  );
}
