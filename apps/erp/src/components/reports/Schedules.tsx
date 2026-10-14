'use client';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { createSchedule, deleteSchedule, setScheduleActive } from '@/app/(dashboard)/reports/actions';
import { useI18n } from '@/i18n/client';
import type { ReportMeta, Schedule } from '@/lib/insights';

import { Alert, Button, MenuItem } from '@/components/kx';
/** Scheduled reports: who gets which report how often (emailed at 06:00), with pause and delete. */
export function Schedules({ schedules, reports }: { schedules: Schedule[]; reports: ReportMeta[] }) {
  const { t, fmt } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reportKey, setReportKey] = useState(reports[0]?.key ?? '');
  const [frequency, setFrequency] = useState('weekly');
  const [format, setFormat] = useState('csv');
  const [recipients, setRecipients] = useState('');
  const title = (key: string) => reports.find((r) => r.key === key)?.title ?? key;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? null));
      if (r.ok) setRecipients('');
    });

  return (
    <div className="flex flex-col gap-4" data-testid="schedules">
      {error && <Alert severity="error">{error}</Alert>}
      {schedules.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('reports.schedules.none')}</p>}
      {schedules.map((s) => (
        <div className="flex flex-wrap gap-3 items-center justify-between" key={s.id}>
          <div className="min-w-0">
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">
              {title(s.reportKey)} · {t(`reports.freq.${s.frequency}`)} · {s.format.toUpperCase()}
            </h6>
            <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
              {s.recipients.join(', ')} · {s.active ? `${t('reports.schedules.next')}: ${fmt.dateTime(s.nextRunAt)}` : t('reports.schedules.paused')}
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="small" disabled={pending} onClick={() => run(() => setScheduleActive(s.id, !s.active))}>
              {s.active ? t('reports.schedules.pause') : t('reports.schedules.resume')}
            </Button>
            <Button size="small" color="error" disabled={pending} onClick={() => run(() => deleteSchedule(s.id))}>
              {t('reports.schedules.delete')}
            </Button>
          </div>
        </div>
      ))}
      <form className="grid grid-cols-[1fr] items-end gap-4 md:grid-cols-[2fr_1fr_1fr]" onSubmit={(e) => { e.preventDefault(); run(() => createSchedule({ reportKey, frequency, format, recipients })); }}>
        <FormField label={t('reports.schedules.report')}>
          <TextInput select value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
            {reports.map((r) => (
              <MenuItem key={r.key} value={r.key}>
                {r.title}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('reports.schedules.frequency')}>
          <TextInput select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {(['daily', 'weekly', 'monthly'] as const).map((f) => (
              <MenuItem key={f} value={f}>
                {t(`reports.freq.${f}`)}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('reports.schedules.format')}>
          <TextInput select value={format} onChange={(e) => setFormat(e.target.value)}>
            <MenuItem value="csv">{t('reports.csv')}</MenuItem>
            <MenuItem value="pdf">{t('reports.pdf')}</MenuItem>
          </TextInput>
        </FormField>
        <div className="min-w-0 md:col-span-2">
          <FormField label={t('reports.schedules.recipients')}>
            <TextInput value={recipients} onChange={(e) => setRecipients(e.target.value)} fullWidth />
          </FormField>
        </div>
        <Button type="submit" variant="contained" disabled={pending || !recipients.trim() || !reportKey}>
          {t('reports.schedules.add')}
        </Button>
      </form>
    </div>
  );
}
