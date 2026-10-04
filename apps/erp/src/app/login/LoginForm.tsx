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
import { useActionState, useState } from 'react';
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
            Sign in
          </Typography>
          <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary', maxWidth: 380 }}>
            to KINETIX ERP: your school's day at a glance, messages to every classroom, and the boards.
          </Typography>
        </Box>

        <Box component="form" action={action} noValidate>
          <input type="hidden" name="next" value={next ?? '/'} />
          <Stack spacing={2.5}>
            {notice && !state.error && <Alert severity={notice.severity}>{notice.text}</Alert>}
            {state.error && (
              <Alert severity="error" role="alert">
                {state.error}
              </Alert>
            )}
            <TextField
              name="tenant"
              label="Institution code"
              defaultValue={state.fields?.tenant ?? defaultTenant}
              autoComplete="organization"
              helperText="Given by your school, for example demo-college"
              required
              autoFocus={!defaultTenant}
              slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
            />
            <TextField
              name="login"
              label="Email or phone"
              defaultValue={state.fields?.login ?? ''}
              autoComplete="username"
              required
              autoFocus={!!defaultTenant}
              slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
            />
            <TextField
              name="password"
              label="Password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} edge="end">
                        {show ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Forgot your password? Ask your school admin.
              </Typography>
              <Button type="submit" variant="contained" disabled={pending} sx={{ minWidth: 104 }}>
                {pending ? <CircularProgress size={20} color="inherit" aria-label="Signing in" /> : 'Sign in'}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
