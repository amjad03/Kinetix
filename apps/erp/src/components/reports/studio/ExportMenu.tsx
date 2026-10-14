'use client';

import { Download, FileSpreadsheet, FileText, Sheet as SheetIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Filter, Source } from '@/lib/report-studio';

/** Downloads the report as Excel, PDF or CSV through the ERP's export route (the session never reaches the browser). */
export function ExportMenu({ source, runtime, disabled }: { source: Source | null; runtime?: Filter[]; disabled?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async (format: 'xlsx' | 'pdf' | 'csv') => {
    if (!source) return;
    setBusy(true);
    try {
      const res = await fetch('/api/report-export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source, runtime: runtime ?? [], format, lang: locale }) });
      if (!res.ok) throw new Error(await res.text());
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `report.${format}`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('rs.export.done', { name }));
    } catch (e) {
      toast.error(t('rs.export.failed', { error: (e as Error).message || t('error.generic') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || busy || !source} data-testid="rs-export">
          <Download />
          {busy ? t('rs.export.working') : t('rs.v.export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void download('xlsx')} data-testid="rs-export-xlsx">
          <FileSpreadsheet />
          {t('rs.export.xlsx')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void download('pdf')} data-testid="rs-export-pdf">
          <FileText />
          {t('rs.export.pdf')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void download('csv')} data-testid="rs-export-csv">
          <SheetIcon />
          {t('rs.export.csv')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
