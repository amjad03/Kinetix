'use client';

import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { signOut } from '@/app/login/actions';
import { LogoMark } from '@/components/Logo';
import { useI18n } from '@/i18n/client';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';
import { changePassword, type ChangePasswordState } from './actions';

export function ChangePasswordForm({ forced, hasPassword, emailName, next, back }: { forced: boolean; hasPassword: boolean; emailName: string; next: string; back: string }) {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePassword, {});
  const [show, setShow] = useState(false);
  const { t } = useI18n();
  const type = show ? 'text' : 'password';
  const toggle = (
    <InputAdornment position="end">
      <IconButton aria-label={show ? t('login.hide') : t('login.show')} onClick={() => setShow((s) => !s)} edge="end">
        {show ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
      </IconButton>
    </InputAdornment>
  );
  const rules = [
    t('account.password.rule.length', { n: MIN_PASSWORD_LENGTH }),
    ...(hasPassword ? [t('account.password.rule.different')] : []),
    ...(emailName.length >= 3 ? [t('account.password.rule.email', { name: emailName })] : []),
    t('account.password.rule.common', { example: 'password123' }),
  ];

  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'm3.surfaceContainer', p: 2 }}>
      <Box
        sx={{
          width: '100%',
          maxWidth: 1040,
          bgcolor: 'm3.surfaceContainerLowest',
          borderRadius: '28px',
          p: { xs: 3, sm: 5 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          columnGap: 6,
          rowGap: 3,
        }}
      >
        <Box>
          <LogoMark size={48} />
          <Typography variant="h2" component="h1" sx={{ mt: 3, fontSize: { xs: '2rem', md: '2.25rem' }, lineHeight: '44px' }}>
            {forced ? t('account.password.forcedTitle') : t('account.password.title')}
          </Typography>
          <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary', maxWidth: 420 }}>
            {forced ? t('account.password.forcedLead') : hasPassword ? t('account.password.lead') : t('account.password.firstLead')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 3, fontWeight: 500 }}>
            {t('account.password.rules')}
          </Typography>
          <Box component="ul" data-testid="password-rules" sx={{ mt: 1, pl: 2.5, color: 'text.secondary', typography: 'body2', '& li': { mb: 0.5 } }}>
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </Box>
        </Box>

        <Box component="form" action={action} noValidate>
          <input type="hidden" name="next" value={next} />
          <Stack spacing={2.5}>
            {state.error && (
              <Alert severity="error" role="alert" data-testid="password-error">
                {state.error}
              </Alert>
            )}
            {hasPassword && (
              <TextField
                name="current"
                label={forced ? t('account.password.temporary') : t('account.password.current')}
                type={type}
                autoComplete="current-password"
                required
                autoFocus
                slotProps={{ input: { endAdornment: toggle } }}
              />
            )}
            <TextField name="new" label={t('account.password.new')} type={type} autoComplete="new-password" required autoFocus={!hasPassword} slotProps={{ htmlInput: { minLength: MIN_PASSWORD_LENGTH } }} />
            <TextField name="confirm" label={t('account.password.confirm')} type={type} autoComplete="new-password" required />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', pt: 2, gap: 1 }}>
              {forced ? (
                <Button type="submit" formAction={signOut} formNoValidate variant="text">
                  {t('shell.signOut')}
                </Button>
              ) : (
                <Button component={Link} href={back} variant="text">
                  {t('account.password.back')}
                </Button>
              )}
              <Button type="submit" variant="contained" disabled={pending} sx={{ minWidth: 104 }}>
                {pending ? <CircularProgress size={20} color="inherit" aria-label={t('account.password.saving')} /> : t('account.password.submit')}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
