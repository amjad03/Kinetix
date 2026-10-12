'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { submitApplication, submitEnquiry } from '@/app/apply/actions';
import { useI18n } from '@/i18n/client';
import type { FormField as QuestionDef, PublicCycles } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import { formatRupees } from '@/lib/money';

import { Alert, Button, MenuItem } from '@/components/kx';
/** The public application form: built from the chosen program's own questions. */
export function ApplyForm({ slug, data }: { slug: string; data: PublicCycles }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [cycleId, setCycleId] = useState(data.cycles[0]?.id ?? '');
  const cycle = data.cycles.find((c) => c.id === cycleId);
  const [f, setF] = useState({ applicantName: '', dateOfBirth: '', gender: '', phone: '', email: '', guardianName: '', guardianPhone: '', guardianEmail: '', guardianRelation: 'parent', website: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
  return (
    <form
      noValidate
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const problems = clientProblems();
        setFieldErrors(problems);
        if (Object.keys(problems).length) return;
        start(async () => {
          const res = await submitApplication(slug, cycleId, { ...f, answers: coerced() });
          if (res.ok) router.push(`/apply/${slug}/track/${res.data.id}?t=${encodeURIComponent(res.data.token)}&new=1`);
          else setError(res.error);
        });
      }}
    >
      <div className="flex flex-col gap-6">
        {error && <Alert severity="error">{error}</Alert>}
        <FormField label={t('apply.program')} required>
          <TextInput select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setAnswers({}); }} required>
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
        <div className="rounded-[12px] border bg-card p-5">
          <h2 className="font-medium tracking-[0.1px] mb-4 text-[1.0625rem]">
            {t('apply.applicant')}
          </h2>
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
          </div>
        </div>
        <div className="rounded-[12px] border bg-card p-5">
          <h2 className="font-medium tracking-[0.1px] mb-4 text-[1.0625rem]">
            {t('apply.guardian')}
          </h2>
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
        {cycle && cycle.formFields.length > 0 && (
          <div className="rounded-[12px] border bg-card p-5">
            <h2 className="font-medium tracking-[0.1px] mb-4 text-[1.0625rem]">
              {t('apply.about', { program: cycle.programName })}
            </h2>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
              {cycle.formFields.map((q) => (
                <Question key={q.key} q={q} value={answers[q.key] ?? ''} error={fieldErrors[q.key]} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
              ))}
            </div>
          </div>
        )}
        {/* Real visitors never see this; bots fill it in. */}
        <div className="absolute left-[-9999px] h-0 overflow-hidden" aria-hidden>
          <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={set('website')} />
        </div>
        <div>
          <Button type="submit" variant="contained" size="large" disabled={pending || !cycle || !f.applicantName.trim() || !f.phone.trim() || !f.guardianName.trim() || !f.guardianPhone.trim()}>
            {t('apply.submit')}
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
