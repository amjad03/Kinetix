'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { acceptResignation, recordResignation, relieveEmployee, saveSettlement, setClearance, withdrawResignation } from '@/app/(dashboard)/hr/talent-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import type { SeparationDetail } from '@/lib/hr-lifecycle';

const TONE: Record<SeparationDetail['status'], Tone> = { submitted: 'warning', clearance: 'info', settled: 'info', relieved: 'success', withdrawn: 'neutral' };
const BLANK = { userId: '', reason: '', noticeDays: '30', lastWorkingDay: '' };

function Case({ s, run, pending }: { s: SeparationDetail; run: (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void; pending: boolean }) {
  const { t, locale } = useI18n();
  const money = (paise: number) => new Intl.NumberFormat(locale === 'en' ? 'en-IN' : locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
  const [lwd, setLwd] = useState(s.lastWorkingDay);
  const [dues, setDues] = useState<Record<string, string>>(Object.fromEntries(s.clearances.map((c) => [c.department, String(c.duesPaise / 100)])));
  const [settle, setSettle] = useState({ amount: s.settlementPaise == null ? '' : String(s.settlementPaise / 100), note: s.settlementNote ?? '' });
  const allCleared = s.clearances.length > 0 && s.clearances.every((c) => c.status === 'cleared');
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} data-testid="exit-case">
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{s.fullName}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('hl.exit.col.resigned')}: {formatDate(s.resignedOn, 'dayMonth', locale)} · {t('hl.exit.col.lastDay')}: {formatDate(s.lastWorkingDay, 'dayMonth', locale)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {s.reason}
          </Typography>
          {s.noticeShortfallDays > 0 && (
            <Typography variant="body2" color="warning.main">
              {t('hl.exit.shortfall', { n: s.noticeShortfallDays })}
            </Typography>
          )}
        </Box>
        <StatusPill tone={TONE[s.status]}>{t(`hl.exit.status.${s.status}` as MessageKey)}</StatusPill>
      </Stack>

      {s.status === 'submitted' && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FormField label={t('hl.exit.lastDay')}>
            <TextInput type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} />
          </FormField>
          <Button variant="contained" disabled={pending} onClick={() => run(() => acceptResignation(s.id, lwd))}>
            {t('hl.exit.accept')}
          </Button>
        </Stack>
      )}

      {(s.status === 'clearance' || s.status === 'settled' || s.status === 'relieved') && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('hl.exit.clearance')} · {t('hl.exit.duesTotal', { amount: money(s.duesPaise) })}
          </Typography>
          <Stack spacing={1}>
            {s.clearances.map((c) => (
              <Stack key={c.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                <Typography sx={{ minWidth: 130 }}>{t(`hl.exit.dept.${c.department}` as MessageKey)}</Typography>
                <StatusPill tone={c.status === 'cleared' ? 'success' : 'warning'}>{c.status === 'cleared' ? t('hl.exit.cleared') : t('hl.exit.pending')}</StatusPill>
                {s.status === 'clearance' && (
                  <>
                    <TextInput type="number" label={t('hl.exit.dues')} value={dues[c.department] ?? '0'} onChange={(e) => setDues({ ...dues, [c.department]: e.target.value })} sx={{ maxWidth: 160 }} />
                    <Button size="small" disabled={pending} onClick={() => run(() => setClearance(s.id, c.department, c.status === 'cleared' ? 'pending' : 'cleared', Number(dues[c.department] ?? 0), c.remarks ?? ''))}>
                      {c.status === 'cleared' ? t('hl.exit.reopen') : t('hl.exit.clear')}
                    </Button>
                  </>
                )}
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {(s.status === 'clearance' || s.status === 'settled') && allCleared && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('hl.exit.settlement')}
          </Typography>
          <Stack spacing={1.5} sx={{ maxWidth: 560 }}>
            <FormField label={t('hl.exit.settlementAmount')}>
              <TextInput type="number" value={settle.amount} onChange={(e) => setSettle({ ...settle, amount: e.target.value })} />
            </FormField>
            <FormField label={t('hl.exit.settlementNote')}>
              <TextInput multiline minRows={3} value={settle.note} onChange={(e) => setSettle({ ...settle, note: e.target.value })} />
            </FormField>
            <Box>
              <Button variant="contained" disabled={pending || settle.amount === '' || settle.note.trim().length < 5} onClick={() => run(() => saveSettlement(s.id, Number(settle.amount), settle.note))}>
                {t('hl.exit.settle')}
              </Button>
            </Box>
          </Stack>
        </Box>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {s.status === 'settled' && (
          <Button variant="contained" disabled={pending} onClick={() => run(() => relieveEmployee(s.id))}>
            {t('hl.exit.relieve')}
          </Button>
        )}
        {s.status === 'relieved' && (
          <Link href={`/api/download?kind=relieving-letter&id=${s.id}`} underline="hover" sx={{ alignSelf: 'center' }}>
            {t('hl.exit.letter')}
          </Link>
        )}
        {(s.status === 'submitted' || s.status === 'clearance') && (
          <Button color="inherit" disabled={pending} onClick={() => run(() => withdrawResignation(s.id))}>
            {t('hl.exit.withdraw')}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/** Staff exit: record a resignation, then notice, clearance by department, the settlement note and the relieving letter. */
export function ExitDesk({ cases, staff }: { cases: SeparationDetail[]; staff: { userId: string; fullName: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState(BLANK);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('hl.exit.record')}</SectionTitle>
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => recordResignation({ userId: f.userId, reason: f.reason, noticeDays: Number(f.noticeDays), lastWorkingDay: f.lastWorkingDay }), () => setF(BLANK));
          }}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}
        >
          <FormField label={t('hl.staff')} required>
            <TextInput select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} required>
              <MenuItem value="">{t('hl.chooseStaff')}</MenuItem>
              {staff.map((s) => (
                <MenuItem key={s.userId} value={s.userId}>
                  {s.fullName}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('hl.exit.reason')} required>
            <TextInput value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required />
          </FormField>
          <FormField label={t('hl.exit.noticeDays')}>
            <TextInput type="number" value={f.noticeDays} onChange={(e) => setF({ ...f, noticeDays: e.target.value })} />
          </FormField>
          <FormField label={t('hl.exit.lastDay')}>
            <TextInput type="date" value={f.lastWorkingDay} onChange={(e) => setF({ ...f, lastWorkingDay: e.target.value })} />
          </FormField>
          <Box>
            <Button type="submit" variant="contained" disabled={pending || !f.userId || f.reason.trim().length < 3}>
              {t('hl.exit.create')}
            </Button>
          </Box>
        </Box>
      </Paper>
      {cases.length === 0 && <Typography color="text.secondary">{t('hl.exit.none')}</Typography>}
      {cases.map((s) => (
        <Case key={`${s.id}-${s.status}`} s={s} run={run} pending={pending} />
      ))}
    </Stack>
  );
}
