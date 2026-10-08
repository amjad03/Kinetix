'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { createSchedule, deleteSchedule, setScheduleActive } from '@/app/(dashboard)/reports/actions';
import { useI18n } from '@/i18n/client';
import type { ReportMeta, Schedule } from '@/lib/insights';

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
    <Stack spacing={2} data-testid="schedules">
      {error && <Alert severity="error">{error}</Alert>}
      {schedules.length === 0 && <Typography color="text.secondary">{t('reports.schedules.none')}</Typography>}
      {schedules.map((s) => (
        <Box key={s.id} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">
              {title(s.reportKey)} · {t(`reports.freq.${s.frequency}`)} · {s.format.toUpperCase()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {s.recipients.join(', ')} · {s.active ? `${t('reports.schedules.next')}: ${fmt.dateTime(s.nextRunAt)}` : t('reports.schedules.paused')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" disabled={pending} onClick={() => run(() => setScheduleActive(s.id, !s.active))}>
              {s.active ? t('reports.schedules.pause') : t('reports.schedules.resume')}
            </Button>
            <Button size="small" color="error" disabled={pending} onClick={() => run(() => deleteSchedule(s.id))}>
              {t('reports.schedules.delete')}
            </Button>
          </Box>
        </Box>
      ))}
      <Box component="form" onSubmit={(e) => { e.preventDefault(); run(() => createSchedule({ reportKey, frequency, format, recipients })); }} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, alignItems: 'start' }}>
        <TextField select size="small" label={t('reports.schedules.report')} value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
          {reports.map((r) => (
            <MenuItem key={r.key} value={r.key}>
              {r.title}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={t('reports.schedules.frequency')} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          {(['daily', 'weekly', 'monthly'] as const).map((f) => (
            <MenuItem key={f} value={f}>
              {t(`reports.freq.${f}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={t('reports.schedules.format')} value={format} onChange={(e) => setFormat(e.target.value)}>
          <MenuItem value="csv">{t('reports.csv')}</MenuItem>
          <MenuItem value="pdf">{t('reports.pdf')}</MenuItem>
        </TextField>
        <TextField size="small" label={t('reports.schedules.recipients')} value={recipients} onChange={(e) => setRecipients(e.target.value)} sx={{ gridColumn: { md: '1 / 3' } }} />
        <Button type="submit" variant="contained" disabled={pending || !recipients.trim() || !reportKey}>
          {t('reports.schedules.add')}
        </Button>
      </Box>
    </Stack>
  );
}
