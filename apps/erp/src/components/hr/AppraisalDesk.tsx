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
import { closeCycle, createCycle, finaliseAppraisal, hodReview, saveSelfAppraisal } from '@/app/(dashboard)/hr/talent-actions';
import { SectionTitle } from '@/components/PageHeader';
import { Dialog, FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Appraisal, AppraisalCategory, AppraisalCycle, AppraisalScores, AppraisalStatus } from '@/lib/hr-lifecycle';

const TONE: Record<AppraisalStatus, Tone> = { draft: 'neutral', self_submitted: 'warning', hod_reviewed: 'info', finalised: 'success' };

export interface AppraisalViewer {
  userId: string;
  /** Can review appraisals (head of department, HR, principal). */
  reviewer: boolean;
  /** Can give the final score. */
  principal: boolean;
  /** Can start and close cycles. */
  hr: boolean;
}

const percent = (scores: AppraisalScores, cats: AppraisalCategory[]) => Math.round((cats.reduce((n, c) => n + Math.min(c.max, Math.max(0, scores[c.key]?.score ?? 0)), 0) / cats.reduce((n, c) => n + c.max, 0)) * 10000) / 100;

/** Score entry for every category: used for the self-appraisal and the head of department's review. */
function ScoreForm({ cats, scores, onChange, evidence, readOnly }: { cats: AppraisalCategory[]; scores: AppraisalScores; onChange: (s: AppraisalScores) => void; evidence: boolean; readOnly?: boolean }) {
  const { t } = useI18n();
  return (
    <Stack spacing={2}>
      {cats.map((c) => (
        <Box key={c.key} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: evidence ? '2fr 1fr 2fr' : '3fr 1fr' }, gap: 1.5, alignItems: 'start' }}>
          <Typography sx={{ pt: 1 }}>{t(`hl.appr.cat.${c.key}` as MessageKey)}</Typography>
          <FormField label={t('hl.appr.score', { max: c.max })}>
            <TextInput type="number" disabled={readOnly} value={scores[c.key]?.score ?? ''} slotProps={{ htmlInput: { min: 0, max: c.max } }} onChange={(e) => onChange({ ...scores, [c.key]: { ...scores[c.key], score: Number(e.target.value) } })} />
          </FormField>
          {evidence && (
            <FormField label={t('hl.appr.evidence')}>
              <TextInput disabled={readOnly} value={scores[c.key]?.evidence ?? ''} onChange={(e) => onChange({ ...scores, [c.key]: { score: scores[c.key]?.score ?? 0, evidence: e.target.value } })} />
            </FormField>
          )}
        </Box>
      ))}
      <Typography color="text.secondary">{t('hl.appr.total', { pct: percent(scores, cats) })}</Typography>
    </Stack>
  );
}

/** Faculty appraisal: cycles, the caller's own form, and the reviews waiting for the head of department and the principal. */
export function AppraisalDesk({ cycles, cycleId, cats, mine, appraisals, viewer }: { cycles: AppraisalCycle[]; cycleId: string | null; cats: AppraisalCategory[]; mine: Appraisal | null; appraisals: Appraisal[]; viewer: AppraisalViewer }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [cycle, setCycle] = useState({ period: '', opensOn: '', closesOn: '' });
  const [self, setSelf] = useState<AppraisalScores>(mine?.selfScores ?? {});
  const [review, setReview] = useState<Appraisal | null>(null);
  const [reviewScores, setReviewScores] = useState<AppraisalScores>({});
  const [final, setFinal] = useState<Appraisal | null>(null);
  const [remarks, setRemarks] = useState('');
  const [finalPct, setFinalPct] = useState('');
  const current = cycles.find((c) => c.id === cycleId) ?? null;
  const locked = !current || current.status !== 'open' || (mine != null && mine.status !== 'draft');
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-end' } }}>
        <Box sx={{ minWidth: 240 }}>
          <FormField label={t('hl.appr.cycle')}>
            <TextInput select value={cycleId ?? ''} onChange={(e) => router.push(`/hr/appraisal?cycle=${e.target.value}`)} disabled={cycles.length === 0}>
              {cycles.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.period} · {c.status === 'open' ? t('hl.appr.open') : t('hl.appr.closed')}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
        </Box>
        {viewer.hr && current?.status === 'open' && (
          <Button color="inherit" disabled={pending} onClick={() => run(() => closeCycle(current.id))}>
            {t('hl.appr.closeCycle')}
          </Button>
        )}
      </Stack>
      {cycles.length === 0 && <Typography color="text.secondary">{t('hl.appr.noCycle')}</Typography>}

      {viewer.hr && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <SectionTitle flush>{t('hl.appr.newCycle')}</SectionTitle>
          <Box
            component="form"
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              run(() => createCycle(cycle), () => setCycle({ period: '', opensOn: '', closesOn: '' }));
            }}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, alignItems: 'end' }}
          >
            <FormField label={t('hl.appr.period')} required>
              <TextInput value={cycle.period} onChange={(e) => setCycle({ ...cycle, period: e.target.value })} required />
            </FormField>
            <FormField label={t('hl.appr.opens')} required>
              <TextInput type="date" value={cycle.opensOn} onChange={(e) => setCycle({ ...cycle, opensOn: e.target.value })} required />
            </FormField>
            <FormField label={t('hl.appr.closes')} required>
              <TextInput type="date" value={cycle.closesOn} onChange={(e) => setCycle({ ...cycle, closesOn: e.target.value })} required />
            </FormField>
            <Box>
              <Button type="submit" variant="contained" disabled={pending}>
                {t('hl.appr.createCycle')}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {current && (
        <Paper variant="outlined" sx={{ p: 2.5 }} data-testid="self-appraisal">
          <SectionTitle flush>{t('hl.appr.mine')}</SectionTitle>
          {mine && mine.status !== 'draft' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('hl.appr.locked')}
            </Alert>
          )}
          <ScoreForm cats={cats} scores={self} onChange={setSelf} evidence readOnly={locked} />
          {!locked && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button disabled={pending} onClick={() => run(() => saveSelfAppraisal(current.id, self, false))}>
                {t('hl.appr.saveDraft')}
              </Button>
              <Button variant="contained" disabled={pending} onClick={() => run(() => saveSelfAppraisal(current.id, self, true))}>
                {t('hl.appr.submit')}
              </Button>
            </Stack>
          )}
        </Paper>
      )}

      {viewer.reviewer && current && (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Box sx={{ p: 2, pb: 0 }}>
            <SectionTitle flush>{t('hl.appr.team')}</SectionTitle>
          </Box>
          {appraisals.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              {t('hl.appr.none')}
            </Typography>
          ) : (
            <Table size="small" data-testid="appraisal-list">
              <TableHead>
                <TableRow>
                  <TableCell>{t('hl.appr.col.staff')}</TableCell>
                  <TableCell>{t('hl.appr.col.status')}</TableCell>
                  <TableCell align="right">{t('hl.appr.col.self')}</TableCell>
                  <TableCell align="right">{t('hl.appr.col.hod')}</TableCell>
                  <TableCell align="right">{t('hl.appr.col.final')}</TableCell>
                  <TableCell>{t('hl.appr.col.grade')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {appraisals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.fullName}</TableCell>
                    <TableCell>
                      <StatusPill tone={TONE[a.status]}>{t(`hl.appr.status.${a.status}` as MessageKey)}</StatusPill>
                    </TableCell>
                    <TableCell align="right">{a.selfPercent}%</TableCell>
                    <TableCell align="right">{a.status === 'self_submitted' || a.status === 'draft' ? '–' : `${a.hodPercent}%`}</TableCell>
                    <TableCell align="right">{a.finalScore == null ? '–' : `${a.finalScore}%`}</TableCell>
                    <TableCell>{a.grade ? t(`hl.grade.${a.grade}` as MessageKey) : '–'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {a.userId !== viewer.userId && (a.status === 'self_submitted' || a.status === 'hod_reviewed') && (
                        <Button
                          size="small"
                          onClick={() => {
                            setReviewScores(Object.keys(a.hodScores).length ? a.hodScores : a.selfScores);
                            setRemarks(a.hodRemarks ?? '');
                            setReview(a);
                          }}
                        >
                          {t('hl.appr.review')}
                        </Button>
                      )}
                      {viewer.principal && a.userId !== viewer.userId && a.status === 'hod_reviewed' && (
                        <Button size="small" onClick={() => { setRemarks(''); setFinalPct(''); setFinal(a); }}>
                          {t('hl.appr.finalise')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      )}

      {review && (
        <Dialog
          size="md"
          title={`${t('hl.appr.review')}: ${review.fullName ?? ''}`}
          onClose={() => setReview(null)}
          busy={pending}
          actions={
            <Button variant="contained" disabled={pending} onClick={() => run(() => hodReview(review.id, reviewScores, remarks), () => setReview(null))}>
              {t('hl.save')}
            </Button>
          }
        >
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="subtitle2">{t('hl.appr.selfScores')}: {review.selfPercent}%</Typography>
            <Typography variant="subtitle2">{t('hl.appr.hodScores')}</Typography>
            <ScoreForm cats={cats} scores={reviewScores} onChange={setReviewScores} evidence={false} />
            <FormField label={t('hl.appr.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </Stack>
        </Dialog>
      )}

      {final && (
        <Dialog
          title={`${t('hl.appr.finalise')}: ${final.fullName ?? ''}`}
          onClose={() => setFinal(null)}
          busy={pending}
          actions={
            <Button variant="contained" disabled={pending} onClick={() => run(() => finaliseAppraisal(final.id, finalPct.trim() === '' ? null : Number(finalPct), remarks), () => setFinal(null))}>
              {t('hl.save')}
            </Button>
          }
        >
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>{t('hl.appr.col.hod')}: {final.hodPercent}%</Typography>
            <FormField label={t('hl.appr.finalPercent')} helper={t('hl.appr.finalHelp')}>
              <TextInput type="number" value={finalPct} slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }} onChange={(e) => setFinalPct(e.target.value)} />
            </FormField>
            <FormField label={t('hl.appr.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </Stack>
        </Dialog>
      )}
    </Stack>
  );
}
