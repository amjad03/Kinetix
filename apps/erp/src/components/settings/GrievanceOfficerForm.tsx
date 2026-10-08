'use client';

import SupportAgentOutlined from '@mui/icons-material/SupportAgentOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { saveGrievanceOfficer } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { grievanceProblem, type GrievanceOfficer } from '@/lib/settings';

/** The DPDP grievance officer: name (required), email and phone; families see it in the apps. */
export function GrievanceOfficerForm({ initial }: { initial: GrievanceOfficer | null }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const problem = grievanceProblem({ name, email, phone });
  const show = (k: NonNullable<typeof problem>[]) => (touched && problem && k.includes(problem) ? t(`grievance.problem.${problem}`) : undefined);
  const changed = name !== (saved?.name ?? '') || email !== (saved?.email ?? '') || phone !== (saved?.phone ?? '');

  const run = (input: { name: string; email: string; phone: string } | null) => {
    setError(null);
    start(async () => {
      const res = await saveGrievanceOfficer(input);
      if (!res.ok) return setError(res.error);
      const g = res.data.grievanceOfficer ?? null;
      setSaved(g);
      setName(g?.name ?? '');
      setEmail(g?.email ?? '');
      setPhone(g?.phone ?? '');
      setTouched(false);
      setToast(input ? t('grievance.saved') : t('grievance.removed'));
    });
  };

  return (
    <>
      <SectionTitle>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <SupportAgentOutlined fontSize="small" /> {t('grievance.title')}
        </Box>
      </SectionTitle>
      <Card data-testid="grievance-officer" data-saved={saved ? 'true' : 'false'} aria-busy={pending} sx={{ px: 2.5, py: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760 }}>
          {t('grievance.help')}
        </Typography>
        {!saved && (
          <Typography variant="body2" sx={{ mt: 1, color: 'error.main' }} data-testid="grievance-not-set">
            {t('grievance.notSet')}
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Box
          component="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!problem) run({ name, email, phone });
          }}
          sx={{ mt: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 2fr 1.5fr' }, alignItems: 'start' }}
        >
          <FormField label={t('grievance.name')} required>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              error={!!show(['name', 'nameLong'])}
              helperText={show(['name', 'nameLong']) ?? ' '}
              slotProps={{ htmlInput: { maxLength: 130, 'data-testid': 'grievance-name' } }}
            />
          </FormField>
          <FormField label={t('grievance.email')}>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!show(['email'])}
              helperText={show(['email']) ?? t('grievance.optional')}
              slotProps={{ htmlInput: { 'data-testid': 'grievance-email' } }}
            />
          </FormField>
          <FormField label={t('grievance.phone')}>
            <TextInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={!!show(['phone'])}
              helperText={show(['phone']) ?? t('grievance.optional')}
              slotProps={{ htmlInput: { inputMode: 'tel', 'data-testid': 'grievance-phone' } }}
            />
          </FormField>
          <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            {saved && (
              <Button color="error" onClick={() => run(null)} disabled={pending} data-testid="grievance-remove">
                {t('grievance.remove')}
              </Button>
            )}
            <Button type="submit" variant="contained" disabled={pending || !changed} data-testid="grievance-save" startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {t('grievance.save')}
            </Button>
          </Box>
        </Box>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
