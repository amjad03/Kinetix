'use client';

import { ArrowLeft, ArrowRight, Copy, GripVertical, LayoutDashboard, MoreHorizontal, Pencil, Plus, RefreshCw, Settings2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { dashboardData, deleteDashboard, duplicateDashboard, saveDashboard } from '@/app/(dashboard)/reports/studio-actions';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Card, DataTable, Dialog, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { CHART_TYPES, moveItem, newWidgetId, type ChartType, type DashboardDoc, type DashboardRow, type LibraryItem, type SavedReportRow, type Widget, type WidgetData } from '@/lib/report-studio';
import { cn } from '@/lib/utils';
import { Labelled, Pick, Toolbar, tk } from './controls';
import { RolePicker } from './Dialogs';
import { ResultView } from './ResultView';

const SPAN: Record<number, string> = { 3: 'md:col-span-6 xl:col-span-3', 4: 'md:col-span-6 xl:col-span-4', 6: 'md:col-span-6', 8: 'md:col-span-12 xl:col-span-8', 12: 'md:col-span-12' };
const HEIGHT: Record<number, string> = { 1: 'min-h-[320px]', 2: 'min-h-[480px]', 3: 'min-h-[640px]' };
const viewHref = (ref: string) => (ref.startsWith('custom:') ? `/reports/view?id=${ref.slice(7)}` : `/reports/view?lib=${ref.slice(4)}`);

/** The dashboards a person may open, and a button to start one. */
export function DashboardsList({ rows }: { rows: DashboardRow[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleting, setDeleting] = useState<DashboardRow | null>(null);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      const res = await saveDashboard({ name: name.trim(), description, widgets: [], sharedRoles: [], defaultForRoles: [] });
      if (res.ok) router.push(`/reports/dashboards/${res.data.id}?edit=1`);
      else toast.error(res.error);
    });
  const columns: Column<DashboardRow>[] = [
    { id: 'name', header: t('rs.col.name'), rowHeader: true, sort: (d) => d.name, cell: (d) => <span className="grid"><span className="font-semibold">{d.name}</span>{d.description && <span className="text-xs text-muted-foreground">{d.description}</span>}</span> },
    { id: 'widgets', header: t('rs.d.col.widgets'), align: 'right', sort: (d) => d.widgets, cell: (d) => fmt.number(d.widgets) },
    { id: 'home', header: t('rs.d.home'), cell: (d) => (d.defaultForRoles.length ? <span className="flex flex-wrap gap-1">{d.defaultForRoles.map((r) => <StatusPill key={r} tone="info">{tk(t, `role.${r}`)}</StatusPill>)}</span> : '–'), hideBelow: 'md' },
    { id: 'owner', header: t('rs.col.owner'), sort: (d) => d.owner, cell: (d) => (d.mine ? t('rs.mine.you') : d.owner), hideBelow: 'lg' },
    { id: 'updated', header: t('rs.col.updated'), sort: (d) => d.updatedAt, cell: (d) => fmt.dateTime(d.updatedAt), hideBelow: 'sm' },
    {
      id: 'actions',
      header: '',
      csv: false,
      width: 48,
      cell: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={t('rs.act.menu', { name: d.name })} onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => router.push(`/reports/dashboards/${d.id}`)}>{t('rs.act.open')}</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await duplicateDashboard(d.id);
                  if (res.ok) router.push(`/reports/dashboards/${res.data.id}?edit=1`);
                  else toast.error(res.error);
                })
              }
            >
              {t('rs.act.duplicate')}
            </DropdownMenuItem>
            {d.canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(d)}>
                  {t('rs.act.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <>
      <DataTable
        label={t('rs.tab.dashboards')}
        columns={columns}
        rows={rows}
        rowId={(d) => d.id}
        rowHref={(d) => `/reports/dashboards/${d.id}`}
        testId="rs-dashboards"
        toolbar={
          <Button className="h-9" onClick={() => setCreating(true)} data-testid="rs-new-dashboard">
            <Plus />
            {t('rs.d.new')}
          </Button>
        }
        empty={
          <EmptyState
            icon={<LayoutDashboard />}
            title={t('rs.d.empty')}
            actions={
              <Button onClick={() => setCreating(true)} data-testid="rs-new-dashboard">
                {t('rs.d.new')}
              </Button>
            }
          >
            {t('rs.d.emptyHelp')}
          </EmptyState>
        }
      />
      {creating && (
        <Dialog
          title={t('rs.d.new')}
          onClose={() => setCreating(false)}
          busy={pending}
          actions={
            <>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                {t('rs.cancel')}
              </Button>
              <Button disabled={pending || !name.trim()} onClick={create} data-testid="rs-dashboard-create">
                {t('rs.d.create')}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <TextInput label={t('rs.d.name')} required value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 120, 'data-testid': 'rs-dashboard-name' } }} />
            <TextInput label={t('rs.save.description')} multiline minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </Dialog>
      )}
      {deleting && (
        <Dialog
          title={t('rs.act.delete')}
          onClose={() => setDeleting(null)}
          busy={pending}
          actions={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                {t('rs.cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await deleteDashboard(deleting.id);
                    if (res.ok) {
                      setDeleting(null);
                      router.refresh();
                    } else toast.error(res.error);
                  })
                }
              >
                {t('rs.act.delete')}
              </Button>
            </>
          }
        >
          <p className="text-sm">{t('rs.d.confirmDelete', { name: deleting.name })}</p>
        </Dialog>
      )}
    </>
  );
}

/** A dashboard: a grid of reports run for the viewer, a period that applies to all of them, and a layout editor. */
export function DashboardView({ doc, initial, library, saved, relative, startEditing }: { doc: DashboardDoc; initial: WidgetData[]; library: LibraryItem[]; saved: SavedReportRow[]; relative: { key: string; label: string }[]; startEditing: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>(doc.widgets);
  const [data, setData] = useState<Record<string, WidgetData>>(() => Object.fromEntries(initial.map((w) => [w.id, w])));
  const [editing, setEditing] = useState(startEditing && doc.canEdit);
  const [period, setPeriod] = useState('');
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const [meta, setMeta] = useState({ name: doc.name, description: doc.description, sharedRoles: doc.sharedRoles, defaultForRoles: doc.defaultForRoles });
  const [dragging, setDragging] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const refresh = (p = period) =>
    start(async () => {
      const res = await dashboardData(doc.id, p || undefined);
      if (res.ok) setData(Object.fromEntries(res.data.widgets.map((w) => [w.id, w])));
      else toast.error(res.error);
    });
  const persist = (next: Widget[], nextMeta = meta, then?: () => void) =>
    start(async () => {
      const res = await saveDashboard({ ...nextMeta, widgets: next }, doc.id);
      if (res.ok) {
        toast.success(t('rs.saved'));
        then?.();
        const fresh = await dashboardData(doc.id, period || undefined);
        if (fresh.ok) setData(Object.fromEntries(fresh.data.widgets.map((w) => [w.id, w])));
        router.refresh();
      } else toast.error(res.error);
    });
  const set = (i: number, patch: Partial<Widget>) => setWidgets((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  return (
    <div className="grid gap-4" data-testid="rs-dashboard">
      <Toolbar label={t('rs.d.toolbar')}>
        <Labelled label={t('rs.d.period')} className="w-[220px]">
          <Pick
            label={t('rs.d.period')}
            value={period || '_saved'}
            onChange={(v) => {
              const p = v === '_saved' ? '' : v;
              setPeriod(p);
              refresh(p);
            }}
            options={[{ value: '_saved', label: t('rs.d.periodAll') }, ...relative.map((r) => ({ value: r.key, label: r.label }))]}
          />
        </Labelled>
        <Button variant="outline" onClick={() => refresh()} disabled={pending}>
          <RefreshCw className={pending ? 'animate-spin' : undefined} />
          {t('rs.d.refresh')}
        </Button>
        <div className="flex-1" />
        {doc.canEdit && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)} data-testid="rs-dashboard-edit">
            <Pencil />
            {t('rs.d.edit')}
          </Button>
        )}
        {doc.canEdit && (
          <Button variant="outline" onClick={() => setSettings(true)}>
            <Settings2 />
            {t('rs.d.settings')}
          </Button>
        )}
        {!doc.canEdit && (
          <Button
            variant="outline"
            onClick={() =>
              start(async () => {
                const res = await duplicateDashboard(doc.id);
                if (res.ok) router.push(`/reports/dashboards/${res.data.id}?edit=1`);
                else toast.error(res.error);
              })
            }
          >
            <Copy />
            {t('rs.act.duplicate')}
          </Button>
        )}
        {editing && (
          <>
            <Button variant="outline" onClick={() => setAdding(true)} data-testid="rs-add-widget">
              <Plus />
              {t('rs.d.addWidget')}
            </Button>
            <Button onClick={() => persist(widgets, meta, () => setEditing(false))} disabled={pending} data-testid="rs-dashboard-done">
              {t('rs.d.done')}
            </Button>
          </>
        )}
      </Toolbar>

      {widgets.length === 0 ? (
        <EmptyState icon={<LayoutDashboard />} title={t('rs.d.widgetEmpty')} actions={doc.canEdit ? <Button onClick={() => (setEditing(true), setAdding(true))}>{t('rs.d.addWidget')}</Button> : undefined}>
          {t('rs.d.widgetEmptyHelp')}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12" aria-busy={pending}>
          {widgets.map((w, i) => {
            const d = data[w.id];
            return (
              <div
                key={w.id}
                className={cn('col-span-1', SPAN[w.w] ?? SPAN[6], HEIGHT[w.h] ?? HEIGHT[1], dragging === i && 'opacity-50')}
                draggable={editing}
                onDragStart={() => setDragging(i)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => editing && dragging !== null && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging !== null) setWidgets((ws) => moveItem(ws, dragging, i));
                  setDragging(null);
                }}
                data-testid={`rs-widget-${w.id}`}
              >
                <Card
                  className="h-full"
                  title={
                    <span className="flex items-center gap-1.5">
                      {editing && <GripVertical aria-hidden className="size-4 cursor-grab text-muted-foreground" />}
                      <Link href={viewHref(w.ref)} className="hover:underline">
                        {w.title || d?.title || t('rs.d.untitled')}
                      </Link>
                    </span>
                  }
                  action={
                    editing ? (
                      <span className="flex items-center gap-0.5">
                        <Button size="icon-sm" variant="ghost" aria-label={t('rs.b.moveUp')} disabled={i === 0} onClick={() => setWidgets((ws) => moveItem(ws, i, i - 1))}>
                          <ArrowLeft />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label={t('rs.b.moveDown')} disabled={i === widgets.length - 1} onClick={() => setWidgets((ws) => moveItem(ws, i, i + 1))}>
                          <ArrowRight />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label={t('rs.b.remove')} onClick={() => setWidgets((ws) => ws.filter((_, j) => j !== i))}>
                          <X />
                        </Button>
                      </span>
                    ) : undefined
                  }
                >
                  {editing && (
                    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md bg-muted/50 p-2">
                      <Input aria-label={t('rs.d.title')} placeholder={t('rs.d.title')} className="h-9 w-[160px] bg-card" value={w.title ?? ''} maxLength={80} onChange={(e) => set(i, { title: e.target.value || undefined })} />
                      <Pick label={t('rs.d.width')} value={String(w.w)} onChange={(v) => set(i, { w: Number(v) })} options={[3, 4, 6, 8, 12].map((n) => ({ value: String(n), label: tk(t, `rs.d.w.${n}`) }))} className="w-[120px]" />
                      <Pick label={t('rs.d.height')} value={String(w.h)} onChange={(v) => set(i, { h: Number(v) })} options={[1, 2, 3].map((n) => ({ value: String(n), label: tk(t, `rs.d.h.${n}`) }))} className="w-[110px]" />
                      <Pick label={t('rs.d.chart')} value={w.chart ?? '_report'} onChange={(v) => set(i, { chart: v === '_report' ? undefined : (v as ChartType) })} options={[{ value: '_report', label: t('rs.d.chart.report') }, ...CHART_TYPES.map((c) => ({ value: c, label: tk(t, `rs.chart.${c}`) }))]} className="w-[140px]" />
                    </div>
                  )}
                  {!d ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{pending ? t('rs.p.loading') : t('rs.d.saveToSee')}</p>
                  ) : !d.ok ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{d.error === 'not_allowed' ? t('rs.d.notAllowed') : `${t('rs.d.failed')}: ${d.error ?? ''}`}</p>
                  ) : d.result ? (
                    <ResultView result={d.result} title={w.title || d.title || ''} chartType={w.chart ?? d.chart} compact source={w.ref.startsWith('custom:') ? { reportId: w.ref.slice(7) } : { libraryKey: w.ref.slice(4) }} />
                  ) : null}
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddWidget library={library} saved={saved} onClose={() => setAdding(false)} onAdd={(ref, chart) => setWidgets((ws) => [...ws, { id: newWidgetId(), ref, chart, w: 6, h: 1 }])} />}
      {settings && (
        <Dialog
          title={t('rs.d.settings')}
          size="md"
          onClose={() => setSettings(false)}
          busy={pending}
          actions={
            <>
              <Button variant="ghost" onClick={() => setSettings(false)}>
                {t('rs.cancel')}
              </Button>
              <Button disabled={pending || !meta.name.trim()} onClick={() => persist(widgets, meta, () => setSettings(false))}>
                {t('rs.save.save')}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <TextInput label={t('rs.d.name')} required value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextInput label={t('rs.save.description')} multiline minRows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            <RolePicker label={t('rs.d.share')} help={t('rs.d.shareHint')} value={meta.sharedRoles} onChange={(sharedRoles) => setMeta({ ...meta, sharedRoles })} />
            {doc.canSetDefault && <RolePicker label={t('rs.d.defaultFor')} help={t('rs.d.defaultHint')} value={meta.defaultForRoles} onChange={(defaultForRoles) => setMeta({ ...meta, defaultForRoles })} />}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function AddWidget({ library, saved, onAdd, onClose }: { library: LibraryItem[]; saved: SavedReportRow[]; onAdd: (ref: string, chart?: ChartType) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [ref, setRef] = useState('');
  const [chart, setChart] = useState('_report');
  const options = [...saved.map((r) => ({ value: `custom:${r.id}`, label: r.name, group: t('rs.d.mineGroup') })), ...library.map((r) => ({ value: `lib:${r.key}`, label: r.title, group: t('rs.d.libraryGroup') }))];
  return (
    <Dialog
      title={t('rs.d.addWidget')}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('rs.cancel')}
          </Button>
          <Button
            disabled={!ref}
            onClick={() => {
              onAdd(ref, chart === '_report' ? undefined : (chart as ChartType));
              onClose();
            }}
            data-testid="rs-add-widget-submit"
          >
            {t('rs.d.add')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Labelled label={t('rs.d.pickReport')}>
          <Pick label={t('rs.d.pickReport')} value={ref} onChange={setRef} options={options} testId="rs-widget-report" />
        </Labelled>
        <Labelled label={t('rs.d.chart')}>
          <Pick label={t('rs.d.chart')} value={chart} onChange={setChart} options={[{ value: '_report', label: t('rs.d.chart.report') }, ...CHART_TYPES.map((c) => ({ value: c, label: tk(t, `rs.chart.${c}`) }))]} />
        </Labelled>
      </div>
    </Dialog>
  );
}
