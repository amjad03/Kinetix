'use client';

import { CalendarPlus, FileDown, FileUp, Send, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { hireApplicant, scoreInterview, uploadResume } from '@/app/(dashboard)/hr/depth-actions';
import { LinkButton } from '@/components/LinkButton';
import { Button } from '@/components/shadcn/button';
import { RecordPage, WorkflowStepper } from '@/components/templates';
import { Card, CheckboxField, DataTable, Dialog, FormField, FormGrid, SelectInput, StatusPill, TextInput, useToast, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { INTERVIEW_CRITERIA, scorePercent, type ApplicantFile } from '@/lib/hr-depth';
import type { JobApplicant } from '@/lib/hr-types';
import { formatRupees } from '@/lib/money';
import { OfferDialog } from './OfferDialog';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired'];
const STAGE_TONE: Record<string, Tone> = { applied: 'neutral', screening: 'info', interview: 'info', offer: 'warning', hired: 'success', rejected: 'danger', withdrawn: 'neutral' };
const REC_TONE: Record<string, Tone> = { select: 'success', hold: 'warning', reject: 'danger' };

/**
 * A candidate's whole file: screening details, interview rounds with every panel member's scores (and the
 * caller's own score sheet when they sit on the panel), offers, hiring into the staff record and the appointment order.
 */
export function CandidateFile({ a, meId, canHire }: { a: ApplicantFile; meId: string; canHire: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [offering, setOffering] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);
  const resume = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const failed = a.stage === 'rejected' || a.stage === 'withdrawn';
  const reached = failed ? Math.max(0, ...a.stageHistory.map((h) => STAGES.indexOf(h.stage))) : STAGES.indexOf(a.stage);
  const steps = STAGES.map((s, i) => ({ id: s, label: t(`hr.rec.stage.${s}` as MessageKey), state: (i <= reached ? 'done' : failed && i === reached + 1 ? 'rejected' : failed ? 'skipped' : i === reached + 1 ? 'current' : 'upcoming') as 'done', at: a.stageHistory.find((h) => h.stage === s)?.at, note: a.stageHistory.find((h) => h.stage === s)?.note }));
  const accepted = a.offers.find((o) => o.status === 'accepted');
  const d = (x: string | null | undefined) => (x ? fmt.date(x.slice(0, 10), 'short') : '–');

  const upload = (f: File) =>
    start(async () => {
      const form = new FormData();
      form.set('file', f);
      const res = await uploadResume(a.id, form);
      if (resume.current) resume.current.value = '';
      if (!res.ok) return toast.error(res.error);
      toast.success(t('hk.uploaded'));
      router.refresh();
    });

  return (
    <>
      <RecordPage
        title={a.fullName}
        subtitle={a.opening.title}
        status={{ label: t(`hr.rec.stage.${a.stage}` as MessageKey), tone: STAGE_TONE[a.stage] }}
        facts={[
          { label: t('rk.f.job-applicants.qualification'), value: a.qualification || '–' },
          { label: t('rk.f.job-applicants.experienceYears'), value: a.experienceYears ?? '–' },
          { label: t('hk.col.interview'), value: a.average ?? '–' },
          { label: t('rk.f.job-applicants.expectedCtcPaise'), value: a.expectedCtcPaise ? formatRupees(a.expectedCtcPaise) : '–' },
        ]}
        primary={
          a.hiredUserId ? (
            <LinkButton href={`/hr/staff/${a.hiredUserId}`} variant="contained">
              {t('hk.hire.openStaff')}
            </LinkButton>
          ) : accepted && canHire ? (
            <Button className="h-9" onClick={() => setHiring(true)}>
              <UserCheck />
              {t('hk.hire.title')}
            </Button>
          ) : !failed ? (
            <Button className="h-9" onClick={() => setOffering(true)}>
              <Send />
              {t('hl.offer.issue')}
            </Button>
          ) : undefined
        }
        secondary={
          <div className="flex flex-wrap gap-2">
            {a.hiredUserId && (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={`/api/download?kind=appointment-letter&id=${a.id}`} target="_blank" rel="noopener">
                  <FileDown />
                  {t('hk.hire.appointment')}
                </a>
              </Button>
            )}
            {a.hasResume && (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={`/api/download?kind=resume&id=${a.id}`} target="_blank" rel="noopener">
                  <FileDown />
                  {t('hk.link.resume')}
                </a>
              </Button>
            )}
            <input ref={resume} type="file" accept="application/pdf,image/jpeg,image/png" hidden aria-hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={() => resume.current?.click()}>
              <FileUp />
              {a.hasResume ? t('hk.upload.replace') : t('hk.upload.resume')}
            </Button>
            {!failed && !a.hiredUserId && (
              <LinkButton href={`/hr/recruitment?view=interviews&f.applicant=${a.id}`} variant="outlined">
                <CalendarPlus />
                {t('hk.rec.schedule')}
              </LinkButton>
            )}
            <LinkButton href={`/hr/recruitment/${a.opening.id}`}>{t('hf.rec.backToOpening')}</LinkButton>
          </div>
        }
        overview={
          <Card>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ['hf.staff.email', a.email ?? '–'],
                  ['hf.staff.phone', a.phone ?? '–'],
                  ['rk.f.job-applicants.currentOrganisation', a.currentOrganisation || '–'],
                  ['rk.f.job-applicants.phd', a.phd ? t('hk.yes') : t('hk.no')],
                  ['rk.f.job-applicants.netSet', a.netSet ? t('hk.yes') : t('hk.no')],
                  ['rk.f.job-applicants.source', t(`rk.o.job-applicants.source.${a.source}` as MessageKey)],
                  ['hk.col.screening', a.screeningScore ?? '–'],
                  ['hf.appliedOn', d(a.createdAt)],
                  ['hf.rec.notes', a.notes || '–'],
                ] as [MessageKey, string | number][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{t(k)}</dt>
                  <dd className="mt-1 text-sm font-medium whitespace-pre-line">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        }
        related={[
          {
            value: 'interviews',
            label: t('rk.entity.job-interviews'),
            count: a.interviews.length,
            content: a.interviews.length ? (
              <div className="grid gap-4">
                {a.interviews.map((iv) => (
                  <Card
                    key={iv.id}
                    title={`${t('hk.rec.round', { n: iv.round })} · ${t(`rk.o.job-interviews.kind.${iv.kind}` as MessageKey)}`}
                    subtitle={`${fmt.dateTime(iv.scheduledAt)}${iv.venue ? ` · ${iv.venue}` : ''}`}
                    action={
                      <div className="flex items-center gap-2">
                        <StatusPill tone={iv.status === 'completed' ? 'success' : iv.status === 'cancelled' ? 'neutral' : 'info'}>{t(`rk.o.job-interviews.status.${iv.status}` as MessageKey)}</StatusPill>
                        {iv.status === 'scheduled' && iv.panelIds.includes(meId) && (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => setScoring(iv.id)}>
                            {t('hk.rec.myScores')}
                          </Button>
                        )}
                      </div>
                    }
                  >
                    {iv.scores.length ? (
                      <DataTable
                        label={t('hk.col.panel')}
                        rows={iv.scores.map((s, k) => ({ ...s, id: `${iv.id}-${k}` }))}
                        rowId={(s) => s.id}
                        columns={[
                          { id: 'p', header: t('hk.col.panel'), rowHeader: true, cell: (s) => s.panelist },
                          ...INTERVIEW_CRITERIA.map((c) => ({ id: c, header: t(`hk.crit.${c}` as MessageKey), align: 'right' as const, hideBelow: 'md' as const, cell: (s: { scores: Record<string, number> }) => s.scores[c] ?? '–' })),
                          { id: 't', header: t('hk.col.total'), align: 'right', cell: (s) => `${s.total}%` },
                          { id: 'r', header: t('hk.col.recommendation'), cell: (s) => <StatusPill tone={REC_TONE[s.recommendation]}>{t(`hk.rec.${s.recommendation}` as MessageKey)}</StatusPill> },
                          { id: 'm', header: t('hk.col.remarks'), hideBelow: 'lg', cell: (s) => s.remarks || '–' },
                        ]}
                      />
                    ) : (
                      <p className="m-0 text-sm text-muted-foreground">{t('hk.rec.noScores')}</p>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('hk.empty.interviewsBody')}</p>
            ),
          },
          {
            value: 'offers',
            label: t('hf.rec.offers'),
            count: a.offers.length,
            content: (
              <DataTable
                label={t('hf.rec.offers')}
                rows={a.offers}
                rowId={(x) => x.id}
                exportName="offers"
                columns={[
                  { id: 'n', header: t('hf.rec.offerNo'), rowHeader: true, cell: (x) => x.offerNo },
                  { id: 'p', header: t('hr.f.designation'), cell: (x) => x.position },
                  { id: 'c', header: t('hf.rec.ctc'), align: 'right', cell: (x) => formatRupees(x.annualCtcPaise) },
                  { id: 'j', header: t('hf.staff.joined'), cell: (x) => d(x.joiningOn) },
                  { id: 's', header: t('hr.f.status'), cell: (x) => <StatusPill tone={x.status === 'accepted' ? 'success' : x.status === 'issued' ? 'info' : 'neutral'}>{t(`hl.offer.status.${x.status}` as MessageKey)}</StatusPill> },
                ]}
              />
            ),
          },
        ]}
        documents={a.offers.map((x) => ({ id: x.id, name: `${x.offerNo}.pdf`, href: `/api/download?kind=offer-letter&id=${x.id}`, meta: x.position }))}
        activity={a.stageHistory.map((h, i) => ({ id: String(i), at: h.at, actor: h.by, action: t(`hr.rec.stage.${h.stage}` as MessageKey), detail: h.note }))}
        aside={
          <Card title={t('hf.rec.pipeline')}>
            <WorkflowStepper steps={steps} label={t('hf.rec.pipeline')} />
          </Card>
        }
      />
      {offering && (
        <OfferDialog
          applicant={{ id: a.id, fullName: a.fullName } as JobApplicant}
          onClose={() => {
            setOffering(false);
            router.refresh();
          }}
        />
      )}
      {hiring && accepted && <HireDialog a={a} joiningOn={accepted.joiningOn} onClose={() => setHiring(false)} />}
      {scoring && <ScoreDialog interviewId={scoring} onClose={() => setScoring(null)} />}
    </>
  );
}

function HireDialog({ a, joiningOn, onClose }: { a: ApplicantFile; joiningOn: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState({ joiningOn, role: 'teacher', employmentType: 'probation', startOnboarding: true });
  const [busy, start] = useTransition();
  const hire = () =>
    start(async () => {
      const res = await hireApplicant(a.id, f);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('hk.hire.done', { code: res.data.employeeCode }));
      onClose();
      router.push(`/hr/staff/${res.data.userId}`);
    });
  return (
    <Dialog
      title={t('hk.hire.title')}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={hire} disabled={busy || !f.joiningOn}>
            {t('hk.hire.title')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-[13px] text-muted-foreground">{t('hk.hire.help')}</p>
        <FormGrid>
          <FormField label={t('hk.hire.joiningOn')} required>
            <TextInput type="date" value={f.joiningOn} onChange={(e) => setF({ ...f, joiningOn: e.target.value })} />
          </FormField>
          <FormField label={t('hk.hire.role')} required>
            <SelectInput value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={['teacher', 'hod', 'librarian', 'accountant', 'hr_manager'].map((r) => ({ value: r, label: t(`role.${r}` as MessageKey) }))} />
          </FormField>
          <FormField label={t('hf.staff.type')} required>
            <SelectInput value={f.employmentType} onChange={(e) => setF({ ...f, employmentType: e.target.value })} options={['probation', 'permanent', 'contract', 'visiting'].map((x) => ({ value: x, label: t(`hf.emp.${x}` as MessageKey) }))} />
          </FormField>
        </FormGrid>
        <CheckboxField label={t('hk.hire.onboarding')} checked={f.startOnboarding} onChange={(v) => setF({ ...f, startOnboarding: v })} />
      </div>
    </Dialog>
  );
}

export function ScoreDialog({ interviewId, onClose }: { interviewId: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, string>>(Object.fromEntries(INTERVIEW_CRITERIA.map((c) => [c, ''])));
  const [recommendation, setRecommendation] = useState<'select' | 'hold' | 'reject'>('select');
  const [remarks, setRemarks] = useState('');
  const [busy, start] = useTransition();
  const valid = INTERVIEW_CRITERIA.every((c) => /^(10|\d)(\.5)?$/.test(scores[c]) && Number(scores[c]) <= 10);
  const numbers = Object.fromEntries(INTERVIEW_CRITERIA.map((c) => [c, Number(scores[c]) || 0]));
  const save = () =>
    start(async () => {
      const res = await scoreInterview(interviewId, { scores: numbers, recommendation, remarks });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('hk.rec.scored', { total: res.data.total }));
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={t('hk.rec.myScores')}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={busy || !valid}>
            {t('hk.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-[13px] text-muted-foreground">{t('hk.rec.scale')}</p>
        <FormGrid>
          {INTERVIEW_CRITERIA.map((c) => (
            <FormField key={c} label={t(`hk.crit.${c}` as MessageKey)} required>
              <TextInput value={scores[c]} onChange={(e) => setScores({ ...scores, [c]: e.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            </FormField>
          ))}
          <FormField label={t('hk.col.recommendation')} required>
            <SelectInput value={recommendation} onChange={(e) => setRecommendation(e.target.value as 'select')} options={(['select', 'hold', 'reject'] as const).map((r) => ({ value: r, label: t(`hk.rec.${r}`) }))} />
          </FormField>
        </FormGrid>
        <FormField label={t('hk.col.remarks')}>
          <TextInput value={remarks} onChange={(e) => setRemarks(e.target.value)} multiline minRows={2} />
        </FormField>
        <p className="m-0 text-sm font-semibold" role="status">
          {t('hk.col.total')}: {valid ? `${scorePercent(numbers)}%` : '–'}
        </p>
      </div>
    </Dialog>
  );
}
