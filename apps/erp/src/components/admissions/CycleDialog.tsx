'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createCycle } from '@/app/(dashboard)/admissions/actions';
import { useI18n } from '@/i18n/client';
import { DEFAULT_DOCUMENTS, DEFAULT_QUESTIONS, parseDocuments, parsePairs, parseQuestions } from '@/lib/cycle-config';
import { addDays } from '@/lib/dates';
import { rupeesToPaise } from '@/lib/money';

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
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('adm.cycle.help')}
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label={t('adm.field.name')} value={f.name} onChange={set('name')} required placeholder={t('adm.cycle.namePlaceholder')} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              <TextField select label={t('adm.field.program')} value={f.programId} onChange={set('programId')} required>
                {programs.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={t('adm.cycle.year')} value={f.academicYearId} onChange={set('academicYearId')} required>
                {years.map((y) => (
                  <MenuItem key={y.id} value={y.id}>
                    {y.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label={t('adm.cycle.entryTerm')} type="number" value={f.entryTerm} onChange={set('entryTerm')} slotProps={{ htmlInput: { min: 1, max: 20 } }} />
              <TextField label={t('adm.cycle.seats')} type="number" value={f.seats} onChange={set('seats')} required slotProps={{ htmlInput: { min: 1 } }} />
              <TextField label={t('adm.cycle.opens')} type="date" value={f.opensOn} onChange={set('opensOn')} required slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label={t('adm.cycle.closes')} type="date" value={f.closesOn} onChange={set('closesOn')} required slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label={t('adm.cycle.fee')} value={f.fee} onChange={set('fee')} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
              <TextField label={t('adm.cycle.offerDays')} type="number" value={f.offerValidDays} onChange={set('offerValidDays')} slotProps={{ htmlInput: { min: 1, max: 60 } }} />
              <TextField label={t('adm.cycle.minAge')} type="number" value={f.minAge} onChange={set('minAge')} slotProps={{ htmlInput: { min: 0, max: 100 } }} />
            </Box>
            <TextField label={t('adm.cycle.questions')} helperText={t('adm.cycle.questionsHelp')} value={f.questions} onChange={set('questions')} multiline minRows={3} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
            <TextField label={t('adm.cycle.documents')} helperText={t('adm.cycle.documentsHelp')} value={f.documents} onChange={set('documents')} multiline minRows={2} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField label={t('adm.cycle.minimums')} helperText={t('adm.cycle.minimumsHelp')} value={f.minimums} onChange={set('minimums')} multiline minRows={2} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
              <TextField label={t('adm.cycle.merit')} helperText={t('adm.cycle.meritHelp')} value={f.merit} onChange={set('merit')} multiline minRows={2} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }} />
            </Box>
          </Stack>
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
