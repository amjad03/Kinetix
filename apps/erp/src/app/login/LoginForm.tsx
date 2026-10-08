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
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { setLanguage } from '@/app/language/actions';
import { useI18n } from '@/i18n/client';
import { BCP47, LANGUAGE_NAMES, LOCALES } from '@/i18n/locales';
import { LogoMark } from '@/components/Logo';
import { signIn, type LoginState } from './actions';

export function LoginForm({
  defaultTenant,
  notice,
  next,
}: {
  defaultTenant: string;
  notice?: { severity: 'info' | 'warning'; text: string };
  next?: string;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [show, setShow] = useState(false);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'm3.surfaceContainer', p: 2 }}
    >
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
            {t('login.title')}
          </Typography>
          <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary', maxWidth: 380 }}>
            {t('login.lead')}
          </Typography>
          <Box role="group" aria-label={t('shell.language')} sx={{ display: 'flex', gap: 0.5, mt: 3, ml: -1, flexWrap: 'wrap' }}>
            {LOCALES.map((l) => (
              <Button
                key={l}
                size="small"
                lang={BCP47[l]}
                variant={l === locale ? 'outlined' : 'text'}
                aria-pressed={l === locale}
                disabled={switching}
                data-testid={`login-language-${l}`}
                onClick={() =>
                  l !== locale &&
                  startSwitch(async () => {
                    await setLanguage(l);
                    router.refresh();
                  })
                }
              >
                {LANGUAGE_NAMES[l]}
              </Button>
            ))}
          </Box>
        </Box>

        <Box component="form" action={action} noValidate>
          <input type="hidden" name="next" value={next ?? ''} />
          <Stack spacing={2.5}>
            {notice && !state.error && <Alert severity={notice.severity}>{notice.text}</Alert>}
            {state.error && (
              <Alert severity="error" role="alert">
                {state.error}
              </Alert>
            )}
            {state.mfaToken ? (
              <>
                <input type="hidden" name="mfaToken" value={state.mfaToken} />
                <Typography variant="h6" component="h2">
                  {t('login.mfa.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('login.mfa.lead')}
                </Typography>
                <FormField label={t('login.mfa.code')} required>
                  <TextInput name="code" autoComplete="one-time-code" autoFocus required slotProps={{ htmlInput: { inputMode: 'numeric', autoCapitalize: 'none', spellCheck: false } }} />
                </FormField>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
                  <Button type="submit" variant="contained" disabled={pending} sx={{ minWidth: 104 }}>
                    {pending ? <CircularProgress size={20} color="inherit" aria-label={t('login.signingIn')} /> : t('login.mfa.submit')}
                  </Button>
                </Box>
              </>
            ) : (
              <>
            <FormField label={t('login.tenant')} required>
              <TextInput
                name="tenant"
                defaultValue={state.fields?.tenant ?? defaultTenant}
                autoComplete="organization"
                helperText={t('login.tenantHelp')}
                required
                autoFocus={!defaultTenant}
                slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
              />
            </FormField>
            <FormField label={t('login.login')} required>
              <TextInput
                name="login"
                defaultValue={state.fields?.login ?? ''}
                autoComplete="username"
                required
                autoFocus={!!defaultTenant}
                slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
              />
            </FormField>
            <FormField label={t('login.password')} required>
              <TextInput
                name="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                required
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton aria-label={show ? t('login.hide') : t('login.show')} onClick={() => setShow((s) => !s)} edge="end">
                          {show ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </FormField>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('login.forgot')}
              </Typography>
              <Button type="submit" variant="contained" disabled={pending} sx={{ minWidth: 104 }}>
                {pending ? <CircularProgress size={20} color="inherit" aria-label={t('login.signingIn')} /> : t('login.submit')}
              </Button>
            </Box>
              </>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
