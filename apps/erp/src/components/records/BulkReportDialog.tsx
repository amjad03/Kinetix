'use client';

import { CircleAlert, CircleCheck, Download } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { Dialog, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { BulkReport } from '@/lib/records';
import { toCsv } from '@/lib/table';

/** What a bulk operation did, record by record: failures first with the reason, and a CSV of the report. */
export function BulkReportDialog({ report, title, onClose }: { report: BulkReport; title: string; onClose: () => void }) {
  const { t } = useI18n();
  const rows = [...report.rows].sort((a, b) => Number(a.ok) - Number(b.ok));
  const download = () => {
    const csv = toCsv([t('rk.report.record'), t('rk.report.result'), t('rk.report.note')], rows.map((r) => [r.label, r.ok ? t('rk.report.done') : t('rk.report.failed'), r.message ?? '']));
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog
      title={title}
      size="md"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={download}>
            <Download />
            {t('rk.report.download')}
          </Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      <div className="grid gap-3" data-testid="bulk-report">
        <p role="status" className="m-0 text-[14px]">
          {!report.committed
            ? t('rk.report.rolledBack', { failed: report.failed })
            : report.failed
              ? t('rk.report.partly', { ok: report.succeeded, failed: report.failed })
              : t('rk.report.allDone', { ok: report.succeeded })}
        </p>
        <ul className="m-0 grid max-h-[50vh] list-none gap-1 overflow-y-auto p-0">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-[13px]">
              {r.ok ? <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-green-ink" /> : <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-red-ink" />}
              <span className="min-w-0 flex-1">
                <b className="font-[550]">{r.label}</b>
                {r.message && <span className="block text-muted-foreground">{r.message}</span>}
              </span>
              <StatusPill tone={r.ok ? (report.committed ? 'success' : 'neutral') : 'danger'}>{r.ok ? (report.committed ? t('rk.report.done') : t('rk.report.undone')) : t('rk.report.failed')}</StatusPill>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
