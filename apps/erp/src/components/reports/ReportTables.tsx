'use client';

import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { LinkButton } from '@/components/LinkButton';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { exportPath, showCell, type ClassroomAnalytics, type ReportMeta, type ReportResult } from '@/lib/insights';

/** How often each classroom tool was used in the period. */
export function ToolUseTable({ rows }: { rows: ClassroomAnalytics['tools'] }) {
  const { t, fmt } = useI18n();
  const columns: Column<ClassroomAnalytics['tools'][number]>[] = [
    { id: 'tool', header: t('reports.classroom.tools'), rowHeader: true, sort: (x) => x.label, cell: (x) => x.label },
    { id: 'uses', header: '#', align: 'right', sort: (x) => x.uses, cell: (x) => fmt.number(x.uses) },
  ];
  return <DataTable testId="classroom-tools" label={t('reports.classroom.tools')} rows={rows} rowId={(x) => x.tool} exportName="classroom-tools" bare columns={columns} />;
}

/** Syllabus coverage by class and subject. */
export function CoverageTable({ rows }: { rows: ClassroomAnalytics['coverage'] }) {
  const { t } = useI18n();
  const columns: Column<ClassroomAnalytics['coverage'][number]>[] = [
    { id: 'label', header: t('reports.classroom.coverage'), rowHeader: true, sort: (c) => c.label, cell: (c) => c.label },
    { id: 'percent', header: '%', align: 'right', sort: (c) => c.percent, cell: (c) => (c.percent === null ? '–' : `${c.percent}%`) },
  ];
  return <DataTable testId="classroom-coverage" label={t('reports.classroom.coverage')} rows={rows} rowId={(c) => c.id} exportName="syllabus-coverage" bare columns={columns} />;
}

/** The report catalogue: search by name, then view, or download as CSV or PDF. */
export function CatalogueTable({ rows, selected, range, from, to }: { rows: ReportMeta[]; selected?: string; range: string; from?: string; to?: string }) {
  const { t } = useI18n();
  const query = { from, to };
  const columns: Column<ReportMeta>[] = [
    {
      id: 'report',
      header: t('reports.catalogue'),
      rowHeader: true,
      sort: (r) => r.title,
      csv: (r) => `${r.title}: ${r.description}`,
      cell: (r) => (
        <>
          <Typography variant="subtitle2">{r.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {r.description}
          </Typography>
        </>
      ),
    },
    {
      id: 'actions',
      header: '',
      csv: false,
      align: 'right',
      cell: (r) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <LinkButton size="small" href={`/reports?report=${r.key}${range ? `&${range}` : ''}`}>
            {t('reports.view')}
          </LinkButton>
          <Button size="small" href={exportPath(r.key, 'csv', query)} startIcon={<FileDownloadOutlined />}>
            {t('reports.csv')}
          </Button>
          <Button size="small" href={exportPath(r.key, 'pdf', query)} startIcon={<FileDownloadOutlined />}>
            {t('reports.pdf')}
          </Button>
        </span>
      ),
    },
  ];
  const cats = [...new Set(rows.map((r) => r.category))];
  return (
    <DataTable
      testId="report-catalogue"
      label={t('reports.catalogue')}
      rows={rows}
      rowId={(r) => r.key}
      highlight={(r) => r.key === selected}
      filters={[{ id: 'category', label: t('reports.category'), options: cats.map((c) => ({ value: c, label: t(`reports.cat.${c}` as MessageKey) })), match: (r, v) => r.category === v }]}
      columns={columns}
    />
  );
}

type Row = ReportResult['rows'][number];

/** The rows of the report that was run, with the columns the report defines. */
export function ReportResultTable({ result, limit }: { result: ReportResult; limit: number }) {
  const { t } = useI18n();
  const columns: Column<Row>[] = result.columns.map((c, i) => ({
    id: c.key,
    header: c.label,
    rowHeader: i === 0,
    align: c.kind && c.kind !== 'text' && c.kind !== 'date' ? 'right' : 'left',
    sort: (row) => row[c.key] ?? null,
    csv: (row) => showCell(c, row[c.key]),
    cell: (row) => showCell(c, row[c.key]),
  }));
  const rows = result.rows.slice(0, limit);
  const ids = new Map(rows.map((r, i) => [r, String(i)]));
  return <DataTable testId="report-result" label={result.title || t('reports.title')} rows={rows} rowId={(r) => ids.get(r) ?? ''} exportName={result.key} columns={columns} />;
}
