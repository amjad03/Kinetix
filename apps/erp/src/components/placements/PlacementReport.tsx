'use client';

import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, FormRow, SelectInput, type Column } from '@/components/ui';
import { tr } from '@/components/records/text';
import { useI18n } from '@/i18n/client';
import type { ReportData, ReportList } from '@/lib/placements-depth';
import { statusLabel } from '@/lib/procurement-labels';

type Row = Record<string, unknown>;

/** One placement report for a year, with the year picker and CSV / Excel downloads. */
export function PlacementReport({ data, years, criteria }: { data: ReportData; years: number[]; criteria: ReportList['criteria'] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const header = (key: string, fallback: string) => tr(t, `pd.rcol.${key}`, fallback);
  const word = (key: string, v: string) =>
    key === 'status' || key === 'joining' ? statusLabel(t, v) : key === 'category' ? tr(t, `pd.cat.${v}`, v) : key === 'kind' ? tr(t, `rk.o.progressions.kind.${v}`, tr(t, `pd.tkind.${v}`, tr(t, `rk.o.placement-feedback.kind.${v}`, v))) : v;
  const cell = (v: unknown, key: string) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? fmt.number(v, { maximumFractionDigits: 2 }) : word(key, String(v)));
  const columns: Column<Row>[] = data.columns.map((c, i) => ({
    id: c.key,
    header: header(c.key, c.header),
    rowHeader: i === 0,
    align: typeof data.rows[0]?.[c.key] === 'number' ? 'right' : undefined,
    sort: (r) => (typeof r[c.key] === 'number' ? (r[c.key] as number) : String(r[c.key] ?? '')),
    cell: (r) => cell(r[c.key], c.key),
  }));
  const href = (format: 'csv' | 'xlsx') => `/api/download?kind=pl-report&id=${data.id}&format=${format}&year=${data.year}`;
  return (
    <Card>
      <FormRow>
        <SelectInput className="w-36" label={t('pd.year')} value={String(data.year)} onChange={(e) => router.push(`/placements/reports?report=${data.id}&year=${e.target.value}`)} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <Button variant="outline" asChild>
          <a href={href('csv')}>
            <Download /> {t('pd.rp.csv')}
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={href('xlsx')}>
            <Download /> {t('pd.rp.xlsx')}
          </a>
        </Button>
      </FormRow>
      <p className="my-3 text-sm text-muted-foreground">{t(`pd.rp.help.${data.id as 'branch'}`)}</p>
      {data.id === 'feedback' && (
        <dl className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i}>
              <dt className="font-medium">{t('pd.rp.criterion', { n: i + 1 })}</dt>
              <dd>{tr(t, `rk.f.placement-feedback.r${i + 1}`, `${criteria.employer[i] ?? ''} / ${criteria.alumni[i] ?? ''}`)}</dd>
            </div>
          ))}
        </dl>
      )}
      <DataTable label={t(`pd.rp.${data.id as 'branch'}`)} columns={columns} rows={data.rows} rowId={(r) => JSON.stringify(r)} empty={t('pd.rp.empty', { year: data.year })} pageSize={50} testId={`pl-report-${data.id}`} />
    </Card>
  );
}
