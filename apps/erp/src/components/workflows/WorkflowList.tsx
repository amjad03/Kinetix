'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { createWorkflow } from '@/app/(dashboard)/workflows/builder/actions';
import { Button } from '@/components/kx';
import { DataTable, Dialog, SelectInput, StatusPill, TextInput, useToast, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { MODULES, type RunRow, type WorkflowListRow, type WorkflowStatus } from '@/lib/workflow-builder';

const STATUS_TONE: Record<WorkflowStatus, Tone> = { active: 'success', draft: 'warning', paused: 'neutral' };
const RUN_TONE: Record<RunRow['status'], Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', returned: 'info', cancelled: 'neutral' };

/** The "New workflow" button and its dialog: a name and a module, then straight to the canvas. */
export function NewWorkflowButton() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [module, setModule] = useState('general');
  const [busy, start] = useTransition();
  const create = () =>
    start(async () => {
      const res = await createWorkflow(name.trim(), module);
      if (res.ok) router.push(`/workflows/builder/${res.data.id}`);
      else toast.error(res.error);
    });
  return (
    <>
      <Button variant="contained" startIcon={<Plus />} onClick={() => setOpen(true)} data-testid="wb-new">
        {t('wb.new')}
      </Button>
      <Dialog
        open={open}
        title={t('wb.new')}
        onClose={() => setOpen(false)}
        busy={busy}
        actions={
          <Button variant="contained" disabled={busy || name.trim().length < 3} onClick={create}>
            {t('wb.create.submit')}
          </Button>
        }
      >
        <div className="grid gap-4 pt-1">
          <TextInput label={t('wb.create.name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth />
          <SelectInput label={t('wb.col.module')} value={module} onChange={(e) => setModule(e.target.value)} options={MODULES.map((m) => ({ value: m, label: t(`wb.module.${m}` as MessageKey) }))} fullWidth />
        </div>
      </Dialog>
    </>
  );
}

/** Workflows: name, module, trigger, status, version, runs and last run. Rows open the builder. */
export function WorkflowList({ rows }: { rows: WorkflowListRow[] }) {
  const { t, fmt } = useI18n();
  const cols: Column<WorkflowListRow>[] = [
    {
      id: 'name',
      header: t('wb.col.name'),
      rowHeader: true,
      sort: (r) => r.name,
      cell: (r) => (
        <span className="flex flex-col">
          <b className="font-semibold">{r.name}</b>
          {r.hasDraft && r.status !== 'draft' && <span className="text-xs text-orange-ink">{t('wb.unpublished')}</span>}
        </span>
      ),
    },
    { id: 'module', header: t('wb.col.module'), sort: (r) => r.module, cell: (r) => t(`wb.module.${r.module}` as MessageKey), hideBelow: 'sm' },
    { id: 'trigger', header: t('wb.col.trigger'), cell: (r) => r.trigger.sources.map((s) => t(`wb.source.${s}` as MessageKey)).join(', '), csv: (r) => r.trigger.sources.join(' '), hideBelow: 'md' },
    { id: 'status', header: t('wb.col.status'), sort: (r) => r.status, cell: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{t(`wb.status.${r.status}` as MessageKey)}</StatusPill> },
    { id: 'version', header: t('wb.col.version'), align: 'right', sort: (r) => r.publishedVersion, cell: (r) => (r.publishedVersion ? `v${r.publishedVersion}` : '–'), hideBelow: 'sm' },
    { id: 'runs', header: t('wb.col.runs'), align: 'right', sort: (r) => r.runs, cell: (r) => fmt.number(r.runs) },
    { id: 'last', header: t('wb.col.lastRun'), sort: (r) => r.lastRunAt, cell: (r) => (r.lastRunAt ? fmt.dateTime(r.lastRunAt) : t('wb.never')), hideBelow: 'md' },
  ];
  return <DataTable columns={cols} rows={rows} rowId={(r) => r.id} label={t('wb.tab.workflows')} rowHref={(r) => `/workflows/builder/${r.id}`} empty={t('wb.empty')} exportName="workflows" testId="wb-list" />;
}

/** Runs: each request through a workflow, its status and how long it took. */
export function RunList({ rows }: { rows: RunRow[] }) {
  const { t, fmt } = useI18n();
  const duration = (r: RunRow) => {
    const ms = new Date(r.finishedAt ?? Date.now()).getTime() - new Date(r.startedAt).getTime();
    const h = Math.floor(ms / 3_600_000);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h >= 1 ? `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m` : `${Math.max(1, Math.round(ms / 60_000))}m`;
  };
  const cols: Column<RunRow>[] = [
    { id: 'title', header: t('wb.col.request'), rowHeader: true, sort: (r) => r.title, cell: (r) => <b className="font-semibold">{r.title}</b> },
    { id: 'wf', header: t('wb.col.workflow'), sort: (r) => r.workflow, cell: (r) => r.workflow },
    { id: 'who', header: t('wb.col.requester'), sort: (r) => r.requesterName, cell: (r) => r.requesterName, hideBelow: 'md' },
    { id: 'started', header: t('wb.col.started'), sort: (r) => r.startedAt, cell: (r) => fmt.dateTime(r.startedAt) },
    { id: 'dur', header: t('wb.col.duration'), align: 'right', cell: duration, csv: false, hideBelow: 'sm' },
    { id: 'step', header: t('wb.col.step'), cell: (r) => r.stepName ?? '–', hideBelow: 'lg' },
    { id: 'status', header: t('wb.col.status'), sort: (r) => r.status, cell: (r) => <StatusPill tone={RUN_TONE[r.status]}>{t(`wb.run.${r.status}` as MessageKey)}</StatusPill> },
  ];
  const filters = [{ id: 'status', label: t('wb.col.status'), options: (['pending', 'approved', 'rejected', 'returned', 'cancelled'] as const).map((s) => ({ value: s, label: t(`wb.run.${s}` as MessageKey) })), match: (r: RunRow, v: string) => r.status === v }];
  return <DataTable columns={cols} rows={rows} rowId={(r) => r.id} label={t('wb.tab.runs')} filters={filters} empty={t('wb.runs.empty')} exportName="workflow-runs" testId="wb-runs" />;
}
