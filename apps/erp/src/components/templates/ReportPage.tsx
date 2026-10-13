'use client';

import { Bookmark, FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Card, DataTable, FormRow, FormRowActions, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { parsePresets, savePreset, type ReportPreset } from '@/lib/templates';

/**
 * ReportPage (docs/product/ERP_UI_PATTERNS.md): filters, a preview table, print / PDF / Excel
 * export and saved presets. Filters are plain named fields in a GET form, so the URL is the
 * report's state (shareable, restored by workspace tabs); the server page reads `searchParams`
 * and passes `rows`. PDF and Excel come from the API (`exports` hrefs, e.g. /api/download?kind=…);
 * the table's own CSV export always works. Presets are per person in this browser.
 */
export function ReportPage<T>({
  reportId,
  title,
  subtitle,
  filters,
  columns,
  rows,
  rowId,
  exports,
  summary,
  rowHref,
}: {
  /** Stable id for presets, e.g. 'fees.collection'. */
  reportId: string;
  title: string;
  subtitle?: ReactNode;
  /** Labelled fields with `name` and `defaultValue` from the URL (TextInput, SelectInput). */
  filters: ReactNode;
  columns: Column<T>[];
  rows: readonly T[];
  rowId: (row: T) => string;
  exports?: { pdf?: string; xlsx?: string };
  /** Totals or stat tiles above the table. */
  summary?: ReactNode;
  /** Opens a row's record page (and offers "Open in new tab"). */
  rowHref?: (row: T) => string | undefined;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const key = `kx.report-presets:${reportId}`;
  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this browser's storage
      setPresets(parsePresets(window.localStorage.getItem(key)));
    } catch {
      /* storage blocked: no presets */
    }
  }, [key]);

  const save = () => {
    const next = savePreset(presets, { name, query });
    setPresets(next);
    setName('');
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };
  const withQuery = (href: string) => (query ? `${href}${href.includes('?') ? '&' : '?'}${query}` : href);

  return (
    <div className="grid gap-6" data-testid="report-page">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10">
                  <Bookmark /> {t('tpl.presets')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>{t('tpl.presets')}</DropdownMenuLabel>
                {presets.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('tpl.noPresets')}</p>}
                {presets.map((p) => (
                  <DropdownMenuItem key={p.name} onSelect={() => router.push(`${pathname}?${p.query}`)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <form
                  className="flex gap-2 p-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('tpl.presetName')} aria-label={t('tpl.presetName')} className="h-9" />
                  <Button type="submit" size="sm" className="h-9" disabled={!name.trim()}>
                    {t('tpl.savePreset')}
                  </Button>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="h-10" onClick={() => window.print()}>
              <Printer /> {t('tpl.print')}
            </Button>
            {exports?.pdf && (
              <Button variant="outline" className="h-10" asChild>
                <a href={withQuery(exports.pdf)}>
                  <FileDown /> {t('tpl.pdf')}
                </a>
              </Button>
            )}
            {exports?.xlsx && (
              <Button variant="outline" className="h-10" asChild>
                <a href={withQuery(exports.xlsx)}>
                  <FileSpreadsheet /> {t('tpl.xlsx')}
                </a>
              </Button>
            )}
          </>
        }
      />
      <Card title={t('tpl.filters')} className="print:hidden">
        <FormRow component="form" method="get" action={pathname}>
          {filters}
          <FormRowActions>
            <Button type="submit">{t('tpl.run')}</Button>
          </FormRowActions>
        </FormRow>
      </Card>
      {summary}
      <DataTable columns={columns} rows={rows} rowId={rowId} label={title} rowHref={rowHref} />
    </div>
  );
}
