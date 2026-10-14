'use client';
import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { saveApplicationDraft, submitApplication, submitEnquiry } from '@/app/apply/actions';
import type { MessageKey } from '@/i18n/messages';
import { useI18n } from '@/i18n/client';
import type { FormField as QuestionDef, PublicCycles } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import { formatRupees } from '@/lib/money';

import { Alert, Button, MenuItem } from '@/components/kx';
/** A saved draft to resume: its id and secret token from the resume link, and what was typed. */
export interface ResumeDraft {
  id: string;
  token: string;
  cycleId: string;
  step: number;
  data: Record<string, unknown>;
}

const STEPS = ['you', 'guardian', 'programme', 'review'] as const;
const BLANK = { applicantName: '', dateOfBirth: '', gender: '', phone: '', email: '', nationality: 'indian', admissionType: 'regular', guardianName: '', guardianPhone: '', guardianEmail: '', guardianRelation: 'parent', website: '' };

/**
 * The public application form in four steps (you, your guardian, the programme's own questions, review), built from
 * the chosen programme's form. It can be saved at any step and resumed later from a private link.
 */
export function ApplyForm({ slug, data, resume }: { slug: string; data: PublicCycles; resume?: ResumeDraft }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const saved = (resume?.data ?? {}) as { f?: Partial<typeof BLANK>; answers?: Record<string, string> };
  const [cycleId, setCycleId] = useState(resume && data.cycles.some((c) => c.id === resume.cycleId) ? resume.cycleId : (data.cycles[0]?.id ?? ''));
  const cycle = data.cycles.find((c) => c.id === cycleId);
  const [f, setF] = useState({ ...BLANK, ...(saved.f ?? {}) });
  const [answers, setAnswers] = useState<Record<string, string>>(saved.answers ?? {});
  const [step, setStep] = useState(Math.min(Math.max(1, resume?.step ?? 1), STEPS.length));
  const [draft, setDraft] = useState<{ id: string; token: string } | null>(resume ? { id: resume.id, token: resume.token } : null);
  const [savedLink, setSavedLink] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (data.cycles.length === 0) return <Alert severity="info">{t('apply.closed')}</Alert>;
  const coerced = () => {
    const out: Record<string, string | number> = {};
    for (const q of cycle!.formFields) {
      const v = answers[q.key]?.trim();
      if (v) out[q.key] = q.type === 'number' ? Number(v) : v;
    }
    return out;
  };
  const clientProblems = () => {
    const p: Record<string, string> = {};
    for (const q of cycle!.formFields) {
      const v = answers[q.key]?.trim();
      if (!v && q.required) p[q.key] = t('apply.required');
      else if (v && q.type === 'number' && (!Number.isFinite(Number(v)) || (q.min !== undefined && Number(v) < q.min) || (q.max !== undefined && Number(v) > q.max))) p[q.key] = t('apply.numberRange', { min: q.min ?? '', max: q.max ?? '' });
    }
    return p;
  };
  const stepReady = (n: number) => (n === 1 ? !!cycle && !!f.applicantName.trim() && !!f.phone.trim() : n === 2 ? !!f.guardianName.trim() && !!f.guardianPhone.trim() : true);
  /** Saves what is typed so far (starting the draft the first time); returns the resume link when it was saved. */
  const save = async (atStep: number): Promise<string | null> => {
    const { website: _w, ...form } = f;
    const res = await saveApplicationDraft(slug, cycleId, draft, { applicantName: f.applicantName.trim(), phone: f.phone.trim(), step: atStep, data: { f: form, answers } });
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    const next = draft ?? { id: res.data.id, token: res.data.token ?? '' };
    if (!draft) setDraft(next);
    return `${window.location.origin}/apply/${slug}?draft=${next.id}&t=${encodeURIComponent(next.token)}`;
  };
  const go = (n: number) => {
    setError(null);
    if (n > step && step === 3) {
      const problems = clientProblems();
      setFieldErrors(problems);
      if (Object.keys(problems).length) return;
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Moving on also saves, once the family has chosen to keep a draft.
    if (draft) start(async () => void (await save(n)));
  };
  const keepForLater = () =>
    start(async () => {
      setError(null);
      const link = await save(step);
      if (link) setSavedLink(link);
    });
  const submit = () =>
    start(async () => {
      setError(null);
      const problems = clientProblems();
      setFieldErrors(problems);
      if (Object.keys(problems).length) return setStep(3);
      const res = await submitApplication(slug, cycleId, { ...f, answers: coerced(), ...(draft && { draftId: draft.id }) });
      if (res.ok) router.push(`/apply/${slug}/track/${res.data.id}?t=${encodeURIComponent(res.data.token)}&new=1`);
      else setError(res.error);
    });
  const box = 'rounded-[12px] border bg-card p-5';
  const heading = 'font-medium tracking-[0.1px] mb-4 text-[1.0625rem]';
  return (
    <form
      noValidate
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (step < STEPS.length) go(step + 1);
        else submit();
      }}
    >
      <div className="flex flex-col gap-6">
        <ol className="flex flex-wrap gap-2" aria-label={t('apply.steps')}>
          {STEPS.map((s, i) => (
            <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className={`rounded-full border px-3 py-1 text-[13px] ${step === i + 1 ? 'border-teal bg-teal-soft font-semibold text-teal-ink' : step > i + 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
              {i + 1}. {t(`apply.step.${s}` as MessageKey)}
            </li>
          ))}
        </ol>
        {error && <Alert severity="error">{error}</Alert>}
        {savedLink && (
          <Alert severity="success">
            <p className="m-0 mb-1">{t('apply.savedHelp')}</p>
            <code className="block break-all text-[12.5px]" data-testid="resume-link">
              {savedLink}
            </code>
            <Button size="small" variant="outlined" className="mt-2" onClick={() => void navigator.clipboard?.writeText(savedLink)}>
              {t('apply.copyLink')}
            </Button>
          </Alert>
        )}

        {step === 1 && (
          <>
            <FormField label={t('apply.program')} required>
              <TextInput
                select
                value={cycleId}
                onChange={(e) => {
                  setCycleId(e.target.value);
                  setAnswers({});
                }}
                required
              >
                {data.cycles.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            {cycle && (
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t('apply.closesOn', { date: formatDate(cycle.closesOn, 'long', locale) })} · {cycle.applicationFeePaise > 0 ? t('apply.fee', { amount: formatRupees(cycle.applicationFeePaise) }) : t('apply.noFee')}
              </p>
            )}
            <div className={box}>
              <h2 className={heading}>{t('apply.applicant')}</h2>
              <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
                <FormField label={t('apply.fullName')} required>
                  <TextInput value={f.applicantName} onChange={set('applicantName')} required />
                </FormField>
                <FormField label={t('adm.field.dob')}>
                  <TextInput type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} slotProps={{ inputLabel: { shrink: true } }} />
                </FormField>
                <FormField label={t('apply.gender')}>
                  <TextInput select value={f.gender} onChange={set('gender')}>
                    <MenuItem value="">{t('apply.preferNot')}</MenuItem>
                    <MenuItem value="female">{t('apply.female')}</MenuItem>
                    <MenuItem value="male">{t('apply.male')}</MenuItem>
                    <MenuItem value="other">{t('apply.other')}</MenuItem>
                  </TextInput>
                </FormField>
                <FormField label={t('adm.field.phone')} required>
                  <TextInput value={f.phone} onChange={set('phone')} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
                </FormField>
                <FormField label={t('adm.field.email')}>
                  <TextInput type="email" value={f.email} onChange={set('email')} />
                </FormField>
                <FormField label={t('apply.nationality')}>
                  <TextInput select value={f.nationality} onChange={set('nationality')}>
                    {['indian', 'nri', 'foreign'].map((v) => (
                      <MenuItem key={v} value={v}>
                        {t(`adk.nationality.${v}` as MessageKey)}
                      </MenuItem>
                    ))}
                  </TextInput>
                </FormField>
                <FormField label={t('apply.admissionType')} helper={t('apply.admissionTypeHelp')}>
                  <TextInput select value={f.admissionType} onChange={set('admissionType')}>
                    {['regular', 'lateral', 'transfer'].map((v) => (
                      <MenuItem key={v} value={v}>
                        {t(`si.o.admissionType.${v}` as MessageKey)}
                      </MenuItem>
                    ))}
                  </TextInput>
                </FormField>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <div className={box}>
            <h2 className={heading}>{t('apply.guardian')}</h2>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
              <FormField label={t('apply.fullName')} required>
                <TextInput value={f.guardianName} onChange={set('guardianName')} required />
              </FormField>
              <FormField label={t('stu.relation')} required>
                <TextInput value={f.guardianRelation} onChange={set('guardianRelation')} required />
              </FormField>
              <FormField label={t('adm.field.phone')} required>
                <TextInput value={f.guardianPhone} onChange={set('guardianPhone')} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
              </FormField>
              <FormField label={t('adm.field.email')}>
                <TextInput type="email" value={f.guardianEmail} onChange={set('guardianEmail')} />
              </FormField>
            </div>
          </div>
        )}

        {step === 3 && cycle && (
          <div className={box}>
            <h2 className={heading}>{t('apply.about', { program: cycle.programName })}</h2>
            {cycle.formFields.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t('apply.noQuestions')}</p>
            ) : (
              <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
                {cycle.formFields.map((q) => (
                  <Question key={q.key} q={q} value={answers[q.key] ?? ''} error={fieldErrors[q.key]} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 4 && cycle && (
          <div className={box}>
            <h2 className={heading}>{t('apply.review')}</h2>
            <dl className="grid grid-cols-[1fr] gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">{t('apply.program')}</dt>
              <dd>{cycle.name}</dd>
              <dt className="text-muted-foreground">{t('apply.applicant')}</dt>
              <dd>
                {f.applicantName} · {f.phone}
                {f.email ? ` · ${f.email}` : ''}
              </dd>
              <dt className="text-muted-foreground">{t('apply.guardian')}</dt>
              <dd>
                {f.guardianName} ({f.guardianRelation}) · {f.guardianPhone}
              </dd>
              {cycle.formFields.map((q) => (
                <Fragment key={q.key}>
                  <dt className="text-muted-foreground">{q.label}</dt>
                  <dd>{answers[q.key] || '—'}</dd>
                </Fragment>
              ))}
            </dl>
            <p className="mt-4 text-[13px] text-muted-foreground">{t('apply.documentsAfter')}</p>
          </div>
        )}

        {/* Real visitors never see this; bots fill it in. */}
        <div className="absolute left-[-9999px] h-0 overflow-hidden" aria-hidden>
          <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={set('website')} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {step > 1 && (
            <Button variant="outlined" size="large" disabled={pending} onClick={() => go(step - 1)}>
              {t('apply.back')}
            </Button>
          )}
          {step < STEPS.length ? (
            <Button type="submit" variant="contained" size="large" disabled={pending || !stepReady(step)} data-testid="apply-next">
              {t('apply.next')}
            </Button>
          ) : (
            <Button type="submit" variant="contained" size="large" disabled={pending || !stepReady(1) || !stepReady(2)} data-testid="apply-submit">
              {t('apply.submit')}
            </Button>
          )}
          <Button variant="text" size="large" disabled={pending || !cycle} onClick={keepForLater} data-testid="apply-save">
            {t('apply.saveLater')}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Question({ q, value, error, onChange }: { q: QuestionDef; value: string; error?: string; onChange: (v: string) => void }) {
  const common = { value, required: q.required, error: !!error, helperText: error ?? ' ', onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) };
  if (q.type === 'select')
    return (
      <FormField label={q.label} required={q.required}>
        <TextInput select {...common}>
          {(q.options ?? []).map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </TextInput>
      </FormField>
    );
  const type = q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : q.type === 'email' ? 'email' : 'text';
  return (
    <FormField label={q.label} required={q.required}>
      <TextInput {...common} type={type} slotProps={{ inputLabel: type === 'date' ? { shrink: true } : undefined, htmlInput: { min: q.min, max: q.max, inputMode: q.type === 'phone' ? 'tel' : undefined } }} />
    </FormField>
  );
}

/** A shorter form for families who only want to ask a question first. */
export function EnquiryForm({ slug, programs, referral = '' }: { slug: string; programs: { id: string; name: string }[]; referral?: string }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: '', phone: '', email: '', programId: '', message: '', website: '', referralCode: referral });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  if (sent) return <Alert severity="success">{t('apply.enquirySent')}</Alert>;
  return (
    <form
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await submitEnquiry(slug, f);
          if (res.ok) setSent(true);
          else setError(res.error);
        });
      }}
    >
      <div className="flex flex-col gap-4">
        {error && <Alert severity="error">{error}</Alert>}
        <FormField label={t('adm.field.name')} required>
          <TextInput value={f.name} onChange={set('name')} required />
        </FormField>
        <FormField label={t('adm.field.phone')} required>
          <TextInput value={f.phone} onChange={set('phone')} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
        </FormField>
        <FormField label={t('adm.field.email')}>
          <TextInput type="email" value={f.email} onChange={set('email')} />
        </FormField>
        <FormField label={t('adm.field.program')}>
          <TextInput select value={f.programId} onChange={set('programId')}>
            <MenuItem value="">{t('adm.enquiry.anyProgram')}</MenuItem>
            {programs.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('adm.field.message')}>
          <TextInput value={f.message} onChange={set('message')} multiline minRows={2} />
        </FormField>
        <FormField label={t('ag.referral.code')} helper={t('ag.referral.help')}>
          <TextInput value={f.referralCode} onChange={set('referralCode')} slotProps={{ htmlInput: { maxLength: 30, autoCapitalize: 'characters' } }} />
        </FormField>
        <div className="absolute left-[-9999px] h-0 overflow-hidden" aria-hidden>
          <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={set('website')} />
        </div>
        <div>
          <Button type="submit" variant="outlined" disabled={pending || !f.name.trim() || !f.phone.trim()}>
            {t('apply.askUs')}
          </Button>
        </div>
      </div>
    </form>
  );
}
