'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { committeeReview } from '@/app/(dashboard)/hr/depth-actions';
import { closeCycle, createCycle, finaliseAppraisal, hodReview, saveSelfAppraisal } from '@/app/(dashboard)/hr/talent-actions';
import { SectionTitle } from '@/components/PageHeader';
import { Dialog, FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Appraisal, AppraisalCategory, AppraisalCycle, AppraisalScores, AppraisalStatus } from '@/lib/hr-lifecycle';

import { Alert, Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
const TONE: Record<AppraisalStatus, Tone> = { draft: 'neutral', self_submitted: 'warning', hod_reviewed: 'info', committee_reviewed: 'info', finalised: 'success' };

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
    <div className="flex flex-col gap-4">
      {cats.map((c) => (
        <div className={`grid grid-cols-1 items-start gap-3 ${evidence ? 'sm:grid-cols-[2fr_1fr_2fr]' : 'sm:grid-cols-[3fr_1fr]'}`} key={c.key}>
          <p className="text-sm leading-[21px] pt-2">{t(`hl.appr.cat.${c.key}` as MessageKey)}</p>
          <FormField label={t('hl.appr.score', { max: c.max })}>
            <TextInput type="number" disabled={readOnly} value={scores[c.key]?.score ?? ''} slotProps={{ htmlInput: { min: 0, max: c.max } }} onChange={(e) => onChange({ ...scores, [c.key]: { ...scores[c.key], score: Number(e.target.value) } })} />
          </FormField>
          {evidence && (
            <FormField label={t('hl.appr.evidence')}>
              <TextInput disabled={readOnly} value={scores[c.key]?.evidence ?? ''} onChange={(e) => onChange({ ...scores, [c.key]: { score: scores[c.key]?.score ?? 0, evidence: e.target.value } })} />
            </FormField>
          )}
        </div>
      ))}
      <p className="text-sm leading-[21px] text-muted-foreground">{t('hl.appr.total', { pct: percent(scores, cats) })}</p>
    </div>
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
  const [committee, setCommittee] = useState<Appraisal | null>(null);
  const [committeePct, setCommitteePct] = useState('');
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
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="min-w-[240px]">
          <FormField label={t('hl.appr.cycle')}>
            <TextInput select value={cycleId ?? ''} onChange={(e) => router.push(`/hr/appraisal?cycle=${e.target.value}`)} disabled={cycles.length === 0}>
              {cycles.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.period} · {c.status === 'open' ? t('hl.appr.open') : t('hl.appr.closed')}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
        </div>
        {viewer.hr && current?.status === 'open' && (
          <Button color="inherit" disabled={pending} onClick={() => run(() => closeCycle(current.id))}>
            {t('hl.appr.closeCycle')}
          </Button>
        )}
      </div>
      {cycles.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('hl.appr.noCycle')}</p>}

      {viewer.hr && (
        <div className="rounded-[12px] border bg-card p-5">
          <SectionTitle flush>{t('hl.appr.newCycle')}</SectionTitle>
          <form className="grid grid-cols-[1fr] sm:grid-cols-[repeat(4,1fr)] gap-3 items-end"
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              run(() => createCycle(cycle), () => setCycle({ period: '', opensOn: '', closesOn: '' }));
            }}
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
            <div>
              <Button type="submit" variant="contained" disabled={pending}>
                {t('hl.appr.createCycle')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {current && (
        <div className="rounded-[12px] border bg-card p-5" data-testid="self-appraisal">
          <SectionTitle flush>{t('hl.appr.mine')}</SectionTitle>
          {mine && mine.status !== 'draft' && (
            <Alert className="mb-4" severity="info">
              {t('hl.appr.locked')}
            </Alert>
          )}
          <ScoreForm cats={cats} scores={self} onChange={setSelf} evidence readOnly={locked} />
          {!locked && (
            <div className="flex flex-row gap-2 mt-4">
              <Button disabled={pending} onClick={() => run(() => saveSelfAppraisal(current.id, self, false))}>
                {t('hl.appr.saveDraft')}
              </Button>
              <Button variant="contained" disabled={pending} onClick={() => run(() => saveSelfAppraisal(current.id, self, true))}>
                {t('hl.appr.submit')}
              </Button>
            </div>
          )}
        </div>
      )}

      {viewer.reviewer && current && (
        <div className="rounded-[12px] border bg-card overflow-x-auto">
          <div className="p-4 pb-0">
            <SectionTitle flush>{t('hl.appr.team')}</SectionTitle>
          </div>
          {appraisals.length === 0 ? (
            <p className="text-sm leading-[21px] text-muted-foreground p-4">
              {t('hl.appr.none')}
            </p>
          ) : (
            <Table size="small" data-testid="appraisal-list">
              <TableHead>
                <TableRow>
                  <TableCell>{t('hl.appr.col.staff')}</TableCell>
                  <TableCell>{t('hl.appr.col.status')}</TableCell>
                  <TableCell align="right">{t('hl.appr.col.self')}</TableCell>
                  <TableCell align="right">{t('hl.appr.col.hod')}</TableCell>
                  <TableCell align="right">{t('hk.appr.feedback')}</TableCell>
                  <TableCell align="right">{t('hk.appr.committee')}</TableCell>
                  <TableCell align="right">{t('hl.appr.col.final')}</TableCell>
                  <TableCell>{t('hl.appr.col.grade')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {appraisals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Link className="text-primary underline-offset-4 hover:underline" href={`/hr/appraisal/${a.id}`}>{a.fullName}</Link></TableCell>
                    <TableCell>
                      <StatusPill tone={TONE[a.status]}>{t(`hl.appr.status.${a.status}` as MessageKey)}</StatusPill>
                    </TableCell>
                    <TableCell align="right">{a.selfPercent}%</TableCell>
                    <TableCell align="right">{a.status === 'self_submitted' || a.status === 'draft' ? '–' : `${a.hodPercent}%`}</TableCell>
                    <TableCell align="right">{a.studentFeedbackScore == null ? '–' : `${a.studentFeedbackScore}%`}</TableCell>
                    <TableCell align="right">{a.committeeScore == null ? '–' : `${a.committeeScore}%`}</TableCell>
                    <TableCell align="right">{a.finalScore == null ? '–' : `${a.finalScore}%`}</TableCell>
                    <TableCell>{a.grade ? t(`hl.grade.${a.grade}` as MessageKey) : '–'}</TableCell>
                    <TableCell className="whitespace-nowrap" align="right">
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
                      {viewer.hr && a.userId !== viewer.userId && (a.status === 'hod_reviewed' || a.status === 'committee_reviewed') && (
                        <Button size="small" onClick={() => { setRemarks(a.committeeRemarks ?? ''); setCommitteePct(a.committeeScore == null ? String(a.hodPercent) : String(a.committeeScore)); setCommittee(a); }}>
                          {t('hk.appr.committeeAction')}
                        </Button>
                      )}
                      {viewer.principal && a.userId !== viewer.userId && (a.status === 'hod_reviewed' || a.status === 'committee_reviewed') && (
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
        </div>
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
          <div className="flex flex-col gap-4 pt-2">
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('hl.appr.selfScores')}: {review.selfPercent}%</h6>
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('hl.appr.hodScores')}</h6>
            <ScoreForm cats={cats} scores={reviewScores} onChange={setReviewScores} evidence={false} />
            <FormField label={t('hl.appr.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </div>
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
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-sm leading-[21px]">{t('hl.appr.col.hod')}: {final.hodPercent}%{final.committeeScore != null && ` · ${t('hk.appr.committee')}: ${final.committeeScore}%`}</p>
            <FormField label={t('hl.appr.finalPercent')} helper={t('hl.appr.finalHelp')}>
              <TextInput type="number" value={finalPct} slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }} onChange={(e) => setFinalPct(e.target.value)} />
            </FormField>
            <FormField label={t('hl.appr.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </div>
        </Dialog>
      )}

      {committee && (
        <Dialog
          title={`${t('hk.appr.committeeAction')}: ${committee.fullName ?? ''}`}
          onClose={() => setCommittee(null)}
          busy={pending}
          actions={
            <Button variant="contained" disabled={pending || committeePct.trim() === ''} onClick={() => run(() => committeeReview(committee.id, Number(committeePct), remarks), () => setCommittee(null))}>
              {t('hl.save')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-sm leading-[21px]">
              {t('hl.appr.col.self')}: {committee.selfPercent}% · {t('hl.appr.col.hod')}: {committee.hodPercent}% · {t('hk.appr.feedback')}: {committee.studentFeedbackScore == null ? '–' : `${committee.studentFeedbackScore}%`}
            </p>
            <FormField label={t('hk.appr.committeePercent')} helper={t('hk.appr.committeeHelp')} required>
              <TextInput type="number" value={committeePct} slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }} onChange={(e) => setCommitteePct(e.target.value)} required />
            </FormField>
            <FormField label={t('hl.appr.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
