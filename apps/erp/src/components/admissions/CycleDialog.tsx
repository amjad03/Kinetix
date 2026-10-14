'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { createCycle } from '@/app/(dashboard)/admissions/actions';
import { useI18n } from '@/i18n/client';
import { DEFAULT_DOCUMENTS, DEFAULT_QUESTIONS, parseDocuments, parsePairs, parseQuestions } from '@/lib/cycle-config';
import { addDays } from '@/lib/dates';
import { rupeesToPaise } from '@/lib/money';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem } from '@/components/kx';
import { Plus as Add } from 'lucide-react';
interface Props {
  programs: { id: string; name: string; termCount?: number }[];
  years: { id: string; label: string; isCurrent: boolean }[];
  today: string;
}

export function NewCycleButton(props: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)} disabled={props.programs.length === 0 || props.years.length === 0}>
        {t('adm.cycle.new')}
      </Button>
      {open && <CycleDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A cycle is one program's intake: seats, fee, the form, the documents, eligibility and merit rules. */
function CycleDialog({ programs, years, today, onClose }: Props & { onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState({
    name: '',
    programId: programs[0]?.id ?? '',
    academicYearId: (years.find((y) => y.isCurrent) ?? years[0])?.id ?? '',
    entryTerm: '1',
    seats: '60',
    opensOn: today,
    closesOn: addDays(today, 45),
    fee: '500',
    offerValidDays: '7',
    questions: DEFAULT_QUESTIONS,
    documents: DEFAULT_DOCUMENTS,
    minAge: '',
    minimums: 'marks_12th 40',
    merit: 'marks_12th 1',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = () => {
    setError(null);
    const q = parseQuestions(f.questions);
    if (!q.ok) return setError(`${t('adm.cycle.questions')}, ${t('adm.cycle.line', { n: q.line })}: ${q.error}`);
    const d = parseDocuments(f.documents);
    if (!d.ok) return setError(`${t('adm.cycle.documents')}, ${t('adm.cycle.line', { n: d.line })}: ${d.error}`);
    const mins = parsePairs(f.minimums);
    if (!mins.ok) return setError(`${t('adm.cycle.minimums')}, ${t('adm.cycle.line', { n: mins.line })}: ${mins.error}`);
    const merit = parsePairs(f.merit);
    if (!merit.ok) return setError(`${t('adm.cycle.merit')}, ${t('adm.cycle.line', { n: merit.line })}: ${merit.error}`);
    const fee = f.fee.trim() === '' ? 0 : rupeesToPaise(f.fee);
    if (fee === null) return setError(t('adm.cycle.feeError'));
    start(async () => {
      const res = await createCycle({
        programId: f.programId,
        academicYearId: f.academicYearId,
        name: f.name.trim(),
        entryTerm: Number(f.entryTerm),
        seats: Number(f.seats),
        opensOn: f.opensOn,
        closesOn: f.closesOn,
        applicationFeePaise: fee,
        offerValidDays: Number(f.offerValidDays),
        formFields: q.value,
        documents: d.value,
        eligibility: { ...(f.minAge.trim() ? { minAge: Number(f.minAge) } : {}), minimums: mins.value.map((m) => ({ field: m.field, min: m.value })) },
        meritRules: merit.value.map((m) => ({ field: m.field, weight: m.value })),
      });
      if (res.ok) {
        router.push(`/admissions/cycles/${res.data.id}`);
        onClose();
      } else setError(res.error);
    });
  };

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="md" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle>{t('adm.cycle.new')}</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-5 pt-1">
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('adm.cycle.help')}
            </p>
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('adm.field.name')} required>
              <TextInput value={f.name} onChange={set('name')} required placeholder={t('adm.cycle.namePlaceholder')} />
            </FormField>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr_1fr] gap-4">
              <FormField label={t('adm.field.program')} required>
                <TextInput select value={f.programId} onChange={set('programId')} required>
                  {programs.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('adm.cycle.year')} required>
                <TextInput select value={f.academicYearId} onChange={set('academicYearId')} required>
                  {years.map((y) => (
                    <MenuItem key={y.id} value={y.id}>
                      {y.label}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('adm.cycle.entryTerm')}>
                <TextInput type="number" value={f.entryTerm} onChange={set('entryTerm')} slotProps={{ htmlInput: { min: 1, max: 20 } }} />
              </FormField>
              <FormField label={t('adm.cycle.seats')} required>
                <TextInput type="number" value={f.seats} onChange={set('seats')} required slotProps={{ htmlInput: { min: 1 } }} />
              </FormField>
              <FormField label={t('adm.cycle.opens')} required>
                <TextInput type="date" value={f.opensOn} onChange={set('opensOn')} required slotProps={{ inputLabel: { shrink: true } }} />
              </FormField>
              <FormField label={t('adm.cycle.closes')} required>
                <TextInput type="date" value={f.closesOn} onChange={set('closesOn')} required slotProps={{ inputLabel: { shrink: true } }} />
              </FormField>
              <FormField label={t('adm.cycle.fee')}>
                <TextInput value={f.fee} onChange={set('fee')} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
              </FormField>
              <FormField label={t('adm.cycle.offerDays')}>
                <TextInput type="number" value={f.offerValidDays} onChange={set('offerValidDays')} slotProps={{ htmlInput: { min: 1, max: 60 } }} />
              </FormField>
              <FormField label={t('adm.cycle.minAge')}>
                <TextInput type="number" value={f.minAge} onChange={set('minAge')} slotProps={{ htmlInput: { min: 0, max: 100 } }} />
              </FormField>
            </div>
            <FormField label={t('adm.cycle.questions')}>
              <TextInput helperText={t('adm.cycle.questionsHelp')} value={f.questions} onChange={set('questions')} multiline minRows={3} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
            </FormField>
            <FormField label={t('adm.cycle.documents')}>
              <TextInput helperText={`${t('adm.cycle.documentsHelp')} · ${t('adk.cycle.docsFor')}`} value={f.documents} onChange={set('documents')} multiline minRows={2} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
            </FormField>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
              <FormField label={t('adm.cycle.minimums')}>
                <TextInput helperText={t('adm.cycle.minimumsHelp')} value={f.minimums} onChange={set('minimums')} multiline minRows={2} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
              </FormField>
              <FormField label={t('adm.cycle.merit')}>
                <TextInput helperText={t('adm.cycle.meritHelp')} value={f.merit} onChange={set('merit')} multiline minRows={2} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
              </FormField>
            </div>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || f.name.trim().length < 3 || !f.programId || !f.academicYearId}>
            {t('adm.cycle.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
