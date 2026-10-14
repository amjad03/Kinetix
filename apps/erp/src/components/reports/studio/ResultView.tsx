"use client";

import { BarChart3, Filter as FilterIcon, SearchX, Table2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { drillReport } from "@/app/(dashboard)/reports/studio-actions";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/shadcn/button";
import { DataTable, Sheet, useToast, type Column } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import {
  barMax,
  defaultChart,
  isNumeric,
  refKey,
  toneOf,
  type ChartType,
  type Definition,
  type Filter,
  type OutColumn,
  type Row,
  type Source,
  type StudioResult,
} from "@/lib/report-studio";
import { cn } from "@/lib/utils";
import { cellText, toneClass } from "./controls";
import { ReportChart } from "./ReportChart";

type Indexed = Row & { __row: number };

/**
 * A report result: the filters in words, the chart, the table (with conditional formatting and
 * data bars), the totals, and drill-down: selecting a summary row, a bar or a cross-tab cell opens
 * the records behind it.
 */
export function ResultView({
  result,
  title,
  chartType,
  definition,
  source,
  runtime,
  compact,
  testId,
}: {
  result: StudioResult;
  title: string;
  chartType?: ChartType;
  /** The definition the result came from: drill-down needs its groupings. */
  definition?: Definition;
  source?: Source;
  runtime?: Filter[];
  compact?: boolean;
  testId?: string;
}) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [drill, setDrill] = useState<{
    label: string;
    result: StudioResult;
  } | null>(null);
  const [pending, start] = useTransition();
  const type = chartType ?? defaultChart(result);
  const bars = useMemo(() => barMax(result), [result]);
  const refs = useMemo(
    () => new Map((definition?.groupBy ?? []).map((r) => [refKey(r), r])),
    [definition],
  );
  const canDrill =
    !!source &&
    !!definition &&
    (definition.groupBy.length > 0 || !!definition.pivot);
  const rows: Indexed[] = useMemo(
    () => result.rows.map((r, i) => ({ ...r, __row: i })),
    [result],
  );

  const openDrill = (rowIndex: number, col?: OutColumn) => {
    if (!canDrill || !source || !definition) return;
    const row = result.rows[rowIndex];
    if (!row) return;
    const cell = result.columns
      .filter((c) => c.dim && refs.has(c.key))
      .map((c) => ({ ref: refs.get(c.key)!, value: row[c.key] ?? null }));
    const words = result.columns
      .filter((c) => c.dim)
      .map((c) => cellText(c, row[c.key] ?? null, fmt, t));
    if (definition.pivot && col?.pivotValue !== undefined) {
      cell.push({
        ref: definition.pivot.column,
        value: col.pivotValue === "" ? null : col.pivotValue,
      });
      words.push(col.pivotValue || t("rs.blank"));
    }
    start(async () => {
      const res = await drillReport(source, cell, runtime ?? []);
      if (res.ok) setDrill({ label: words.join(" · "), result: res.data });
      else toast.error(res.error);
    });
  };

  const columns: Column<Indexed>[] = result.columns.map((c, ci) => ({
    id: c.key,
    header: c.label,
    align: isNumeric(c.type) ? "right" : "left",
    rowHeader: ci === 0,
    sort: (r) => {
      const v = r[c.key];
      return typeof v === "boolean" ? (v ? 1 : 0) : (v ?? null);
    },
    csv: (r) => cellText(c, r[c.key] ?? null, fmt, t),
    cell: (r) => {
      const v = r[c.key] ?? null;
      const tone = toneOf(c, v, result.formatting);
      const text = cellText(c, v, fmt, t);
      const max = bars[c.key];
      const inner = (
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded px-1.5 py-0.5 whitespace-nowrap tabular-nums",
            tone && toneClass(tone.tone, tone.style),
          )}
        >
          {max ? (
            <span
              aria-hidden
              className="relative h-2 w-16 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-1)]"
                style={{
                  width: `${Math.min(100, (Math.abs(Number(v ?? 0)) / max) * 100)}%`,
                }}
              />
            </span>
          ) : null}
          {text}
        </span>
      );
      if (canDrill && c.pivotValue !== undefined && v !== null) {
        return (
          <button
            type="button"
            className="rounded hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            onClick={(e) => (e.stopPropagation(), openDrill(r.__row, c))}
            aria-label={t("rs.drill.cell", { value: text, column: c.label })}
          >
            {inner}
          </button>
        );
      }
      return inner;
    },
  }));

  const hasChart = type !== "table" && result.rows.length > 0;
  const totals = result.totals;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0" data-testid={testId}>
      {!compact && (
        <div
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          data-testid="rs-filters"
        >
          <FilterIcon aria-hidden className="size-3.5" />
          {result.filters.length ? (
            result.filters.map((f) => (
              <span
                key={f}
                className="rounded-full bg-muted px-2 py-0.5 text-foreground"
              >
                {f}
              </span>
            ))
          ) : (
            <span>{t("rs.filters.none")}</span>
          )}
          <span className="ml-auto">
            {t("rs.p.rows", { n: result.rows.length })}
          </span>
        </div>
      )}
      {result.rows.length === 0 ? (
        <EmptyState
          dense
          icon={<SearchX />}
          title={t("rs.p.empty")}
          testId="rs-empty"
        >
          {t("rs.p.emptyHelp")}
        </EmptyState>
      ) : (
        <>
          {hasChart && !compact && (
            <div
              className="flex justify-end gap-1"
              role="group"
              aria-label={t("rs.v.show")}
            >
              <Button
                size="sm"
                variant={view === "chart" ? "secondary" : "ghost"}
                onClick={() => setView("chart")}
                aria-pressed={view === "chart"}
              >
                <BarChart3 />
                {t("rs.v.chartView")}
              </Button>
              <Button
                size="sm"
                variant={view === "table" ? "secondary" : "ghost"}
                onClick={() => setView("table")}
                aria-pressed={view === "table"}
              >
                <Table2 />
                {t("rs.v.tableView")}
              </Button>
            </div>
          )}
          {hasChart && (compact || view === "chart") && (
            <div
              className={compact ? undefined : "rounded-lg border bg-card p-4"}
              data-testid="rs-chart"
            >
              <ReportChart
                result={result}
                type={type}
                spec={result.chart}
                title={title}
                height={compact ? 220 : 300}
                onSelect={canDrill ? (i, s) => openDrill(i, s) : undefined}
              />
            </div>
          )}
          {(!compact || !hasChart) && (
            <div className="min-w-0 overflow-x-auto">
              <DataTable
                label={title}
                columns={columns}
                rows={rows}
                rowId={(r) => String(r.__row)}
                pageSize={compact ? 10 : 25}
                bare={compact}
                dense={result.columns.length > 8}
                onRowClick={
                  canDrill && result.columns.some((c) => c.dim)
                    ? (r) => openDrill(r.__row)
                    : undefined
                }
                testId="rs-table"
              />
            </div>
          )}
          {totals && (!compact || !hasChart) && (
            <dl
              className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm"
              data-testid="rs-totals"
              aria-label={t("rs.totals")}
            >
              <dt className="font-semibold">{t("rs.totals")}</dt>
              {result.columns
                .filter(
                  (c) =>
                    !c.dim &&
                    totals[c.key] !== null &&
                    totals[c.key] !== undefined,
                )
                .slice(0, 24)
                .map((c) => (
                  <div key={c.key} className="flex gap-2">
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd className="m-0 font-semibold tabular-nums">
                      {cellText(c, totals[c.key] ?? null, fmt, t)}
                    </dd>
                  </div>
                ))}
            </dl>
          )}
          {result.truncated && (
            <p className="text-xs text-muted-foreground">
              {t("rs.p.truncated", { n: result.rows.length })}
            </p>
          )}
          {result.pivot?.truncated && (
            <p className="text-xs text-muted-foreground">
              {t("rs.p.pivotTruncated")}
            </p>
          )}
          {canDrill && !compact && (
            <p className="text-xs text-muted-foreground">
              {pending ? t("rs.p.loading") : t("rs.v.drillHint")}
            </p>
          )}
        </>
      )}
      <Sheet
        open={!!drill}
        onClose={() => setDrill(null)}
        title={t("rs.drill.title", { label: drill?.label ?? "" })}
        subtitle={
          drill
            ? t("rs.drill.count", { n: drill.result.rows.length })
            : undefined
        }
        width={720}
      >
        {drill && (
          <ResultView
            result={drill.result}
            title={drill.label}
            chartType="table"
            testId="rs-drill"
          />
        )}
      </Sheet>
    </div>
  );
}
