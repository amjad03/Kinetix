'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useActionState } from 'react';
import { castSignIn, type CastSignInState } from '@/app/cast/actions';
import { useI18n } from '@/i18n/client';

export function CastSignIn({ defaultTenant }: { defaultTenant: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<CastSignInState, FormData>(castSignIn, {});
  return (
    <Stack component="form" action={action} spacing={2} sx={{ maxWidth: 420 }}>
      {state.error && <Alert severity="error">{state.error}</Alert>}
      <TextField name="tenant" label={t('cast.school')} defaultValue={state.fields?.tenant ?? defaultTenant} autoComplete="organization" required />
      <TextField name="login" label={t('cast.login')} defaultValue={state.fields?.login} autoComplete="username" required />
      <TextField name="password" type="password" label={t('cast.password')} autoComplete="current-password" required />
      <Button type="submit" variant="contained" disabled={pending} startIcon={pending ? <CircularProgress size={16} /> : undefined}>
        {t('cast.signInButton')}
      </Button>
    </Stack>
  );
}
