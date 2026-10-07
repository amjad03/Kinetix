'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { submitApplication, submitEnquiry } from '@/app/apply/actions';
import { useI18n } from '@/i18n/client';
import type { FormField, PublicCycles } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import { formatRupees } from '@/lib/money';

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
    <Box
      component="form"
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
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select label={t('apply.program')} value={cycleId} onChange={(e) => { setCycleId(e.target.value); setAnswers({}); }} required>
          {data.cycles.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        {cycle && (
          <Typography variant="body2" color="text.secondary">
            {t('apply.closesOn', { date: formatDate(cycle.closesOn, 'long', locale) })} · {cycle.applicationFeePaise > 0 ? t('apply.fee', { amount: formatRupees(cycle.applicationFeePaise) }) : t('apply.noFee')}
          </Typography>
        )}
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2, fontSize: '1.0625rem' }}>
            {t('apply.applicant')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label={t('apply.fullName')} value={f.applicantName} onChange={set('applicantName')} required />
            <TextField label={t('adm.field.dob')} type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select label={t('apply.gender')} value={f.gender} onChange={set('gender')}>
              <MenuItem value="">{t('apply.preferNot')}</MenuItem>
              <MenuItem value="female">{t('apply.female')}</MenuItem>
              <MenuItem value="male">{t('apply.male')}</MenuItem>
              <MenuItem value="other">{t('apply.other')}</MenuItem>
            </TextField>
            <TextField label={t('adm.field.phone')} value={f.phone} onChange={set('phone')} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
            <TextField label={t('adm.field.email')} type="email" value={f.email} onChange={set('email')} />
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2, fontSize: '1.0625rem' }}>
            {t('apply.guardian')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label={t('apply.fullName')} value={f.guardianName} onChange={set('guardianName')} required />
            <TextField label={t('stu.relation')} value={f.guardianRelation} onChange={set('guardianRelation')} required />
            <TextField label={t('adm.field.phone')} value={f.guardianPhone} onChange={set('guardianPhone')} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
            <TextField label={t('adm.field.email')} type="email" value={f.guardianEmail} onChange={set('guardianEmail')} />
          </Box>
        </Paper>
        {cycle && cycle.formFields.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2, fontSize: '1.0625rem' }}>
              {t('apply.about', { program: cycle.programName })}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {cycle.formFields.map((q) => (
                <Question key={q.key} q={q} value={answers[q.key] ?? ''} error={fieldErrors[q.key]} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
              ))}
            </Box>
          </Paper>
        )}
        {/* Real visitors never see this; bots fill it in. */}
        <Box aria-hidden sx={{ position: 'absolute', left: -9999, height: 0, overflow: 'hidden' }}>
          <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={set('website')} />
        </Box>
        <Box>
          <Button type="submit" variant="contained" size="large" disabled={pending || !cycle || !f.applicantName.trim() || !f.phone.trim() || !f.guardianName.trim() || !f.guardianPhone.trim()}>
            {t('apply.submit')}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

function Question({ q, value, error, onChange }: { q: FormField; value: string; error?: string; onChange: (v: string) => void }) {
  const common = { label: q.label, value, required: q.required, error: !!error, helperText: error ?? ' ', onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) };
  if (q.type === 'select')
    return (
      <TextField select {...common}>
        {(q.options ?? []).map((o) => (
          <MenuItem key={o} value={o}>
            {o}
          </MenuItem>
        ))}
      </TextField>
    );
  const type = q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : q.type === 'email' ? 'email' : 'text';
  return <TextField {...common} type={type} slotProps={{ inputLabel: type === 'date' ? { shrink: true } : undefined, htmlInput: { min: q.min, max: q.max, inputMode: q.type === 'phone' ? 'tel' : undefined } }} />;
}

/** A shorter form for families who only want to ask a question first. */
export function EnquiryForm({ slug, programs }: { slug: string; programs: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: '', phone: '', email: '', programId: '', message: '', website: '' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  if (sent) return <Alert severity="success">{t('apply.enquirySent')}</Alert>;
  return (
    <Box
      component="form"
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
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label={t('adm.field.name')} value={f.name} onChange={set('name')} required />
        <TextField label={t('adm.field.phone')} value={f.phone} onChange={set('phone')} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
        <TextField label={t('adm.field.email')} type="email" value={f.email} onChange={set('email')} />
        <TextField select label={t('adm.field.program')} value={f.programId} onChange={set('programId')}>
          <MenuItem value="">{t('adm.enquiry.anyProgram')}</MenuItem>
          {programs.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField label={t('adm.field.message')} value={f.message} onChange={set('message')} multiline minRows={2} />
        <Box aria-hidden sx={{ position: 'absolute', left: -9999, height: 0, overflow: 'hidden' }}>
          <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={set('website')} />
        </Box>
        <Box>
          <Button type="submit" variant="outlined" disabled={pending || !f.name.trim() || !f.phone.trim()}>
            {t('apply.askUs')}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
