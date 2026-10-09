'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelInterview, completeInterview, markNoShow, saveSheet, scheduleInterview } from '@/app/(dashboard)/admissions/growth-actions';
import { SectionTitle } from '@/components/PageHeader';
import { Dialog, FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface Interview {
  id: string;
  applicationId: string;
  applicantName: string;
  applicationNo: string;
  slotAt: string;
  venue: string | null;
  panel: { userId: string | null; name: string }[];
  status: 'scheduled' | 'done' | 'cancelled' | 'no_show';
  outcome: 'selected' | 'waitlisted' | 'rejected' | null;
  score: number | null;
  maxScore: number;
}
export interface ApplicantOption {
  id: string;
  applicationNo: string;
  applicantName: string;
  cycleName: string;
}

const TONE: Record<Interview['status'], Tone> = { scheduled: 'info', done: 'success', cancelled: 'neutral', no_show: 'warning' };
const CRITERIA = [
  { key: 'ag.int.criterion.communication', max: 10 },
  { key: 'ag.int.criterion.aptitude', max: 10 },
  { key: 'ag.int.criterion.motivation', max: 10 },
] as const;

/** Interview slots with a panel, each panelist's score sheet, and the outcome that feeds the merit list. */
export function InterviewsDesk({ interviews, applicants }: { interviews: Interview[]; applicants: ApplicantOption[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ applicationId: '', slotAt: '', venue: '', panel: '' });
  const [sheet, setSheet] = useState<Interview | null>(null);
  const [closing, setClosing] = useState<Interview | null>(null);
  const [scores, setScores] = useState<number[]>(CRITERIA.map(() => 0));
  const [remarks, setRemarks] = useState('');
  const [outcome, setOutcome] = useState('selected');
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('ag.int.schedule')}</SectionTitle>
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => scheduleInterview(f), () => setF({ applicationId: '', slotAt: '', venue: '', panel: '' }));
          }}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}
        >
          <FormField label={t('ag.int.application')} required>
            <TextInput select value={f.applicationId} onChange={(e) => setF({ ...f, applicationId: e.target.value })} required>
              <MenuItem value="">{t('ag.int.chooseApplication')}</MenuItem>
              {applicants.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.applicantName} · {a.applicationNo}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('ag.int.slot')} required>
            <TextInput type="datetime-local" value={f.slotAt} onChange={(e) => setF({ ...f, slotAt: e.target.value })} required />
          </FormField>
          <FormField label={t('ag.int.venue')}>
            <TextInput value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          </FormField>
          <FormField label={t('ag.int.panel')} required>
            <TextInput multiline minRows={2} value={f.panel} onChange={(e) => setF({ ...f, panel: e.target.value })} required />
          </FormField>
          <Box>
            <Button type="submit" variant="contained" disabled={pending || !f.applicationId || !f.slotAt || !f.panel.trim()}>
              {t('ag.int.create')}
            </Button>
          </Box>
        </Box>
      </Paper>

      {interviews.length === 0 ? (
        <Typography color="text.secondary">{t('ag.int.none')}</Typography>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" data-testid="interview-list">
            <TableHead>
              <TableRow>
                <TableCell>{t('ag.int.col.candidate')}</TableCell>
                <TableCell>{t('ag.int.col.slot')}</TableCell>
                <TableCell>{t('ag.int.col.panel')}</TableCell>
                <TableCell>{t('ag.int.col.status')}</TableCell>
                <TableCell align="right">{t('ag.int.col.score')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {interviews.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    {i.applicantName}
                    <Typography variant="caption" color="text.secondary" component="div">
                      {i.applicationNo}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {when(i.slotAt)}
                    {i.venue && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {i.venue}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{i.panel.map((p) => p.name).join(', ')}</TableCell>
                  <TableCell>
                    <StatusPill tone={TONE[i.status]}>{t(`ag.int.status.${i.status}` as MessageKey)}</StatusPill>
                    {i.outcome && (
                      <Typography variant="caption" component="div" color="text.secondary">
                        {t(`ag.int.outcome.${i.outcome}` as MessageKey)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{i.score == null ? '–' : `${i.score} / ${i.maxScore}`}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {i.status === 'scheduled' && (
                      <>
                        <Button size="small" onClick={() => { setScores(CRITERIA.map(() => 0)); setRemarks(''); setSheet(i); }}>
                          {t('ag.int.sheet')}
                        </Button>
                        <Button size="small" onClick={() => { setOutcome('selected'); setRemarks(''); setClosing(i); }}>
                          {t('ag.int.complete')}
                        </Button>
                        <Button size="small" color="warning" disabled={pending} onClick={() => run(() => markNoShow(i.id))}>
                          {t('ag.int.noShow')}
                        </Button>
                        <Button size="small" color="inherit" disabled={pending} onClick={() => run(() => cancelInterview(i.id))}>
                          {t('ag.int.cancel')}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {sheet && (
        <Dialog
          title={`${t('ag.int.sheet')}: ${sheet.applicantName}`}
          onClose={() => setSheet(null)}
          busy={pending}
          actions={
            <Button
              variant="contained"
              disabled={pending}
              onClick={() => run(() => saveSheet(sheet.id, CRITERIA.map((c, k) => ({ criterion: t(c.key), score: scores[k], max: c.max })), remarks), () => setSheet(null))}
            >
              {t('ag.int.sheetSave')}
            </Button>
          }
        >
          <Stack spacing={2} sx={{ pt: 1 }}>
            {CRITERIA.map((c, k) => (
              <FormField key={c.key} label={`${t(c.key)} (${t('ag.int.outOf', { max: c.max })})`}>
                <TextInput type="number" value={scores[k]} slotProps={{ htmlInput: { min: 0, max: c.max, step: 0.5 } }} onChange={(e) => setScores(scores.map((s, j) => (j === k ? Number(e.target.value) : s)))} />
              </FormField>
            ))}
            <FormField label={t('ag.int.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </Stack>
        </Dialog>
      )}

      {closing && (
        <Dialog
          title={`${t('ag.int.complete')}: ${closing.applicantName}`}
          onClose={() => setClosing(null)}
          busy={pending}
          actions={
            <Button variant="contained" disabled={pending} onClick={() => run(() => completeInterview(closing.id, outcome, remarks), () => setClosing(null))}>
              {t('ag.int.complete')}
            </Button>
          }
        >
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormField label={t('ag.int.decision')}>
              <TextInput select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {(['selected', 'waitlisted', 'rejected'] as const).map((o) => (
                  <MenuItem key={o} value={o}>
                    {t(`ag.int.outcome.${o}` as MessageKey)}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('ag.int.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </Stack>
        </Dialog>
      )}
    </Stack>
  );
}
