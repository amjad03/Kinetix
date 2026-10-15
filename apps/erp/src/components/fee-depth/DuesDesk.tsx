'use client';

import { BellRing, CalendarClock, Forward, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskRead, deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, Dialog, EmptyState, FormRow, StatusPill, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { nextFy, type CarryRow, type ReminderRun } from '@/lib/fee-depth';

interface Schedule {
  enabled?: boolean;
  daysBefore?: number[];
  daysAfter?: number[];
  channels?: string[];
  dailySummary?: boolean;
}

/**
 * Dues: reminders on the schedule (and sent now by hand) with the log of every run, the daily collection summary to
 * the management, and carrying a year's unpaid fees into the next year as arrears.
 */
export function DuesDesk({ schedule, runs, fy }: { schedule: Schedule; runs: ReminderRun[]; fy: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromYear, setFromYear] = useState(fy);
  const [toYear, setToYear] = useState(nextFy(fy));
  const [dueOn, setDueOn] = useState(`${nextFy(fy).slice(0, 4)}-06-30`);
  const [rows, setRows] = useState<CarryRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  const remind = () =>
    start(async () => {
      const res = await deskSend<{ students: number; app: number; sms: number; whatsapp: number; skipped: string[] }>('/v1/fee-collect/reminders/run', {});
      if (!res.ok) return setError(res.error);
      setError(null);
      setMsg(t('fx.remindersSent', { n: res.data.students, app: res.data.app, sms: res.data.sms, wa: res.data.whatsapp }) + (res.data.skipped.length ? ` ${res.data.skipped.join(' ')}` : ''));
      router.refresh();
    });
  const summary = () =>
    start(async () => {
      const res = await deskSend<{ sentTo: number; collectedPaise: number }>('/v1/fee-collect/summary/send', {});
      if (!res.ok) return setError(res.error);
      setError(null);
      setMsg(t('fx.summarySent', { n: res.data.sentTo, amount: fmt.rupees(res.data.collectedPaise) }));
    });
  const check = () =>
    start(async () => {
      const res = await deskRead<CarryRow[]>(`/v1/fee-collect/carry-forward?fromYear=${encodeURIComponent(fromYear)}`);
      if (!res.ok) return setError(res.error);
      setError(null);
      setRows(res.data);
    });
  const carry = () =>
    start(async () => {
      const res = await deskSend<{ students: number; invoices: number; amountPaise: number }>('/v1/fee-collect/carry-forward', { fromYear, toYear, dueOn });
      setConfirm(false);
      if (!res.ok) return setError(res.error);
      setError(null);
      setRows(null);
      setMsg(t('fx.carried', { n: res.data.students, amount: fmt.rupees(res.data.amountPaise) }));
      router.refresh();
    });

  const runCols: Column<ReminderRun>[] = [
    { id: 'on', header: t('fx.col.date'), rowHeader: true, cell: (r) => fmt.date(r.runOn, 'short'), sort: (r) => r.runOn },
    { id: 'kind', header: t('fx.col.kind'), cell: (r) => <StatusPill tone={r.kind === 'manual' ? 'info' : 'neutral'}>{r.kind === 'manual' ? t('fx.byHand') : t('fx.scheduled')}</StatusPill> },
    { id: 'students', header: t('fx.col.students'), align: 'right', cell: (r) => fmt.number(r.students) },
    { id: 'app', header: t('fx.col.app'), align: 'right', hideBelow: 'sm', cell: (r) => fmt.number(r.app) },
    { id: 'sms', header: t('fx.col.sms'), align: 'right', hideBelow: 'md', cell: (r) => fmt.number(r.sms) },
    { id: 'wa', header: t('fx.col.whatsapp'), align: 'right', hideBelow: 'md', cell: (r) => fmt.number(r.whatsapp) },
    { id: 'by', header: t('fx.col.by'), hideBelow: 'lg', cell: (r) => r.runByName ?? t('fd.system') },
    { id: 'skipped', header: t('fx.col.note'), hideBelow: 'lg', cell: (r) => <span className="block max-w-[320px] whitespace-normal text-muted-foreground">{r.skipped.join(' ')}</span> },
  ];
  const carryCols: Column<CarryRow>[] = [
    { id: 'student', header: t('fx.col.student'), rowHeader: true, cell: (r) => `${r.student} · ${r.rollNo}`, sort: (r) => r.student },
    { id: 'title', header: t('fx.col.invoice'), cell: (r) => r.title },
    { id: 'due', header: t('fx.col.dueOn'), hideBelow: 'sm', cell: (r) => fmt.date(r.dueOn, 'short') },
    { id: 'bal', header: t('fx.col.balance'), align: 'right', cell: (r) => fmt.rupees(r.balancePaise), sort: (r) => r.balancePaise },
  ];
  const carryTotal = (rows ?? []).reduce((a, r) => a + r.balancePaise, 0);
  const students = new Set((rows ?? []).map((r) => r.studentId)).size;

  return (
    <div className="grid gap-6">
      {msg && (
        <p role="status" className="m-0 rounded-md bg-muted px-4 py-3 text-sm">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('fx.reminders')} subtitle={schedule.enabled ? t('fx.scheduleOn', { before: (schedule.daysBefore ?? []).join(', ') || '—', after: (schedule.daysAfter ?? []).join(', ') || '—', channels: (schedule.channels ?? ['app']).map((c) => t(`fx.ch.${c}` as MessageKey)).join(', ') }) : t('fx.scheduleOff')}>
          <div className="flex flex-wrap gap-2">
            <Button className="h-9" disabled={pending} onClick={remind}>
              <BellRing className="size-4" /> {t('fx.remindOverdueNow')}
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/accounts/settings">
                <CalendarClock className="size-4" /> {t('fx.editSchedule')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/accounts/reports/outstanding">{t('fx.defaulters')}</Link>
            </Button>
          </div>
        </Card>
        <Card title={t('fx.dailySummary')} subtitle={schedule.dailySummary ? t('fx.summaryOn') : t('fx.summaryOff')}>
          <Button variant="outline" className="h-9" disabled={pending} onClick={summary}>
            <Mail className="size-4" /> {t('fx.sendSummaryNow')}
          </Button>
        </Card>
      </div>

      <Card title={t('fx.reminderLog')}>{runs.length === 0 ? <EmptyState icon={<BellRing />} title={t('fx.noRuns')} dense /> : <DataTable columns={runCols} rows={runs} rowId={(r) => r.id} label={t('fx.reminderLog')} />}</Card>

      <Card title={t('fx.carryForward')} subtitle={t('fx.carryForwardHint')}>
        <div className="grid gap-4">
          <FormRow>
            <TextInput label={t('fx.f.fromYear')} value={fromYear} onChange={(e) => { setFromYear(e.target.value); setRows(null); }} placeholder="2025-26" />
            <TextInput label={t('fx.f.toYear')} value={toYear} onChange={(e) => setToYear(e.target.value)} placeholder="2026-27" />
            <TextInput label={t('fx.f.arrearsDue')} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            <Button variant="outline" disabled={pending} onClick={check}>
              {t('fx.checkDues')}
            </Button>
          </FormRow>
          {rows &&
            (rows.length === 0 ? (
              <EmptyState icon={<Forward />} title={t('fx.nothingToCarry')} dense />
            ) : (
              <>
                <DataTable columns={carryCols} rows={rows} rowId={(r) => r.id} label={t('fx.carryForward')} exportName="carry-forward" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm">{t('fx.willCarry', { n: students, amount: fmt.rupees(carryTotal) })}</span>
                  <Button className="h-9" disabled={pending} onClick={() => setConfirm(true)}>
                    <Forward className="size-4" /> {t('fx.carryNow')}
                  </Button>
                </div>
              </>
            ))}
        </div>
      </Card>

      {confirm && (
        <Dialog
          title={t('fx.carryConfirmTitle')}
          busy={pending}
          onClose={() => setConfirm(false)}
          actions={
            <>
              <Button variant="outline" onClick={() => setConfirm(false)}>
                {t('fd.cancel')}
              </Button>
              <Button disabled={pending} onClick={carry}>
                {t('fx.carryNow')}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">{t('fx.carryConfirm', { n: students, amount: fmt.rupees(carryTotal), from: fromYear, to: toYear })}</p>
        </Dialog>
      )}
    </div>
  );
}
