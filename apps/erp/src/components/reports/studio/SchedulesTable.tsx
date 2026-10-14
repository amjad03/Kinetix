'use client';

import { CalendarClock, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteSchedule, runScheduleNow, scheduleRuns, updateSchedule } from '@/app/(dashboard)/reports/studio-actions';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { DataTable, Dialog, Sheet, StatusPill, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ScheduleRow, ScheduleRun } from '@/lib/report-studio';
import { tk } from './controls';
import { ScheduleDialog } from './Dialogs';

const viewHref = (ref: string) => (ref.startsWith('custom:') ? `/reports/view?id=${ref.slice(7)}` : `/reports/view?lib=${ref.slice(4)}`);

/** Scheduled report emails: when they go, to whom, how the last one went, and their run history. */
export function SchedulesTable({ schedules }: { schedules: ScheduleRow[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [deleting, setDeleting] = useState<ScheduleRow | null>(null);
  const [history, setHistory] = useState<{ row: ScheduleRow; runs: ScheduleRun[] } | null>(null);

  const time = (h: number) => fmt.time(`2026-01-01T${String(h).padStart(2, '0')}:00:00+05:30`);
  const when = (s: ScheduleRow) =>
    s.frequency === 'daily' ? t('rs.s.everyDay', { time: time(s.hour) }) : s.frequency === 'weekly' ? t('rs.s.everyWeek', { day: tk(t, `rs.weekday.${s.weekday}`), time: time(s.hour) }) : t('rs.s.everyMonth', { n: s.monthDay, time: time(s.hour) });
  const who = (s: ScheduleRow) => [...s.recipients.roles.map((r) => tk(t, `role.${r}`)), ...s.recipients.emails, ...(s.recipients.userIds.length ? [t('rs.s.morePeople', { n: s.recipients.userIds.length })] : [])].join(', ');
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else toast.error(res.error ?? t('error.generic'));
    });

  const columns: Column<ScheduleRow>[] = [
    {
      id: 'report',
      header: t('rs.s.col.report'),
      rowHeader: true,
      sort: (s) => s.name || s.title,
      cell: (s) => (
        <span className="grid">
          {s.available ? (
            <Link href={viewHref(s.ref)} className="font-semibold hover:underline">
              {s.name || s.title}
            </Link>
          ) : (
            <span className="font-semibold">{s.name || s.title}</span>
          )}
          {(!s.available || (s.name && s.name !== s.title)) && <span className="text-xs text-muted-foreground">{s.available ? s.title : t('rs.s.unavailable')}</span>}
        </span>
      ),
    },
    { id: 'when', header: t('rs.s.col.when'), cell: (s) => `${when(s)} · ${s.format.toUpperCase()}`, csv: (s) => when(s) },
    { id: 'to', header: t('rs.s.col.recipients'), cell: (s) => <span className="line-clamp-2 max-w-[260px] text-xs">{who(s)}</span>, csv: (s) => who(s), hideBelow: 'lg' },
    { id: 'next', header: t('rs.s.col.next'), sort: (s) => s.nextRunAt, cell: (s) => (s.active ? fmt.dateTime(s.nextRunAt) : '–'), hideBelow: 'md' },
    {
      id: 'status',
      header: t('rs.s.col.status'),
      sort: (s) => `${s.active ? 1 : 0}${s.lastStatus ?? ''}`,
      cell: (s) => (
        <span className="grid justify-items-start gap-1">
          {!s.active ? <StatusPill tone="neutral">{t('rs.s.paused')}</StatusPill> : s.lastStatus === 'failed' ? <StatusPill tone="danger">{t('rs.s.failed')}</StatusPill> : s.lastStatus === 'ok' ? <StatusPill tone="success">{t('rs.s.ok')}</StatusPill> : <StatusPill tone="info">{t('rs.s.never')}</StatusPill>}
          {s.lastStatus === 'failed' && s.lastError && <span className="max-w-[240px] text-xs text-red-ink">{s.lastError}</span>}
          {s.failureCount > 1 && <span className="text-xs text-muted-foreground">{t('rs.s.failures', { n: s.failureCount })}</span>}
          {s.lastRunAt && <span className="text-xs text-muted-foreground">{fmt.relative(s.lastRunAt)}</span>}
        </span>
      ),
      csv: (s) => s.lastStatus ?? '',
    },
    {
      id: 'actions',
      header: '',
      csv: false,
      width: 48,
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={t('rs.act.menu', { name: s.name || s.title })} data-testid={`rs-sched-menu-${s.id}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={pending || !s.available} onSelect={() => run(async () => {
              const res = await runScheduleNow(s.id);
              return res.ok ? (res.data.ok ? { ok: true } : { ok: false, error: t('rs.s.runFailed', { error: res.data.error ?? '' }) }) : res;
            }, t('rs.s.sentNow'))}>{t('rs.s.runNow')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run(() => updateSchedule(s.id, { active: !s.active }), s.active ? t('rs.s.paused') : t('rs.s.active'))}>{s.active ? t('rs.s.pause') : t('rs.s.resume')}</DropdownMenuItem>
            <DropdownMenuItem disabled={!s.available} onSelect={() => setEditing(s)}>{t('rs.act.edit')}</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await scheduleRuns(s.id);
                  if (res.ok) setHistory({ row: s, runs: res.data });
                  else toast.error(res.error);
                })
              }
            >
              {t('rs.s.history')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}>
              {t('rs.act.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const runCols: Column<ScheduleRun>[] = [
    { id: 'at', header: t('rs.s.run.at'), sort: (r) => r.createdAt, cell: (r) => fmt.dateTime(r.createdAt) },
    { id: 'status', header: t('rs.s.col.status'), cell: (r) => (r.status === 'ok' ? <StatusPill tone="success">{t('rs.s.ok')}</StatusPill> : <StatusPill tone="danger">{t('rs.s.failed')}</StatusPill>) },
    { id: 'detail', header: t('rs.s.run.detail'), cell: (r) => (r.status === 'ok' ? t('rs.s.run.sent', { rows: r.rowCount, n: r.deliveredTo.length }) : (r.error ?? '')) },
    { id: 'manual', header: t('rs.s.run.how'), cell: (r) => (r.manual ? t('rs.s.manual') : t('rs.s.auto')) },
  ];

  return (
    <>
      <DataTable
        label={t('rs.tab.schedules')}
        columns={columns}
        rows={schedules}
        rowId={(s) => s.id}
        rowTone={(s) => (s.lastStatus === 'failed' ? 'danger' : undefined)}
        initialSort={{ id: 'next', dir: 'asc' }}
        testId="rs-schedules"
        empty={
          <EmptyState icon={<CalendarClock />} title={t('rs.s.empty')}>
            {t('rs.s.emptyHelp')}
          </EmptyState>
        }
      />
      {editing && <ScheduleDialog source={null} existing={editing} title={editing.title} runtime={editing.runtime} onClose={() => (setEditing(null), router.refresh())} />}
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
              <Button variant="destructive" disabled={pending} onClick={() => (run(() => deleteSchedule(deleting.id), t('rs.deleted')), setDeleting(null))}>
                {t('rs.act.delete')}
              </Button>
            </>
          }
        >
          <p className="text-sm">{t('rs.s.confirmDelete', { name: deleting.name || deleting.title })}</p>
        </Dialog>
      )}
      <Sheet open={!!history} onClose={() => setHistory(null)} title={t('rs.s.historyTitle')} subtitle={history ? history.row.name || history.row.title : undefined} width={640}>
        {history && <DataTable label={t('rs.s.historyTitle')} columns={runCols} rows={history.runs} rowId={(r) => r.id} bare empty={<p className="text-sm text-muted-foreground">{t('rs.s.never')}</p>} />}
      </Sheet>
    </>
  );
}
