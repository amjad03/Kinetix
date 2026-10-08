'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { issueFee } from '@/app/(dashboard)/fees/actions';
import { addDays, isIsoDate } from '@/lib/dates';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { useI18n } from '@/i18n/client';

export interface FeeClass {
  id: string;
  name: string;
  /** Active students, when known (the accounts office cannot read the school structure). */
  students: number | null;
}

export function IssueFeeButton({ classes, today, defaultClassId }: { classes: FeeClass[]; today: string; defaultClassId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  return (
    <>
      <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)} disabled={classes.length === 0}>
        {t('fees.issue')}
      </Button>
      {open && (
        <IssueFeeDialog
          classes={classes}
          today={today}
          defaultClassId={defaultClassId}
          onClose={(done) => {
            setOpen(false);
            if (done) setToast(done);
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}

function IssueFeeDialog({ classes, today, defaultClassId, onClose }: { classes: FeeClass[]; today: string; defaultClassId?: string; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [sectionId, setSectionId] = useState(defaultClassId && classes.some((c) => c.id === defaultClassId) ? defaultClassId : (classes[0]?.id ?? ''));
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState(addDays(today, 14));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const paise = rupeesToPaise(amount);
  const klass = classes.find((c) => c.id === sectionId);
  const amountError = amount.trim() !== '' && (paise === null || paise < 100);
  const ready = !!sectionId && !!title.trim() && paise !== null && paise >= 100 && isIsoDate(dueOn);

  const submit = () => {
    if (!ready || paise === null) return;
    setError(null);
    start(async () => {
      const res = await issueFee({ sectionId, title, amountPaise: paise, dueOn });
      if (res.ok) onClose(t('fees.issue.done', { title: title.trim(), n: res.data.invoices, className: klass?.name ?? t('fees.issue.theClass') }));
      else setError(res.error);
    });
  };

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth aria-labelledby="issue-fee-title">
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="issue-fee-title">{t('fees.issue.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            {t('fees.issue.help')}
          </Typography>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('fees.class')} required>
              <TextInput select value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                    {c.students !== null && (
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                        {t('fees.issue.students', { n: c.students })}
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('fees.issue.fee')} required>
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('fees.issue.feePlaceholder')}
                required
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
            </FormField>
            <FormField label={t('fees.issue.amount')} required>
              <TextInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                error={amountError}
                helperText={
                  amountError
                    ? t('fees.issue.amountError')
                    : paise
                      ? klass?.students
                        ? t('fees.issue.total', { amount: formatRupees(paise), n: klass.students, total: formatRupees(paise * klass.students) })
                        : formatRupees(paise)
                      : ' '
                }
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
              />
            </FormField>
            <FormField label={t('fees.issue.dueOn')} required>
              <TextInput
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                required
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
              />
            </FormField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('fees.issue.submit')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
