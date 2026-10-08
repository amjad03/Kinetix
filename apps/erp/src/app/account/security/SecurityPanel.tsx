'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useI18n } from '@/i18n/client';
import type { MfaStatus, SessionRow } from '@/lib/insights';
import { confirmMfa, disableMfa, newBackupCodes, revokeOtherSessions, revokeSession, startMfa } from './actions';

/** Two-step sign-in set-up (TOTP authenticator and backup codes) and the devices the user is signed in on. */
export function SecurityPanel({ status, sessions, back }: { status: MfaStatus; sessions: SessionRow[]; back: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[] | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? null));
      if (r.ok) after?.();
    });

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      <Card sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Typography variant="h6" component="h2">
            {t('security.mfa.title')}
          </Typography>
          <Chip size="small" color={status.enrolled ? 'success' : 'default'} label={status.enrolled ? t('security.mfa.statusOn') : t('security.mfa.statusOff')} />
        </Box>
        {!status.enrolled && status.required && <Alert severity="warning" sx={{ mb: 2 }}>{t('security.mfa.required')}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {status.enrolled ? t('security.mfa.on') : t('security.mfa.off')}
        </Typography>

        {!status.enrolled && !setup && (
          <Button variant="contained" disabled={pending} onClick={() => run(async () => { const r = await startMfa(); if (r.ok) setSetup(r.data); return r; })}>
            {t('security.mfa.start')}
          </Button>
        )}
        {setup && !backup && (
          <Stack spacing={2} component="form" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await confirmMfa(code); if (r.ok) setBackup(r.data.backupCodes); return r; }, () => setSetup(null)); }}>
            <Typography variant="body2">{t('security.mfa.secret')}</Typography>
            <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: 2, wordBreak: 'break-all' }} data-testid="mfa-secret">
              {setup.secret}
            </Typography>
            <Button href={setup.otpauthUri} size="small" sx={{ alignSelf: 'flex-start' }}>
              {t('security.mfa.open')}
            </Button>
            <TextField size="small" label={t('security.mfa.code')} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" slotProps={{ htmlInput: { inputMode: 'numeric' } }} sx={{ maxWidth: 240 }} />
            <Button type="submit" variant="contained" disabled={pending || code.trim().length < 6} sx={{ alignSelf: 'flex-start' }}>
              {t('security.mfa.confirm')}
            </Button>
          </Stack>
        )}
        {backup && (
          <Stack spacing={1.5}>
            <Alert severity="info">{t('security.mfa.backup')}</Alert>
            <Box component="pre" sx={{ fontFamily: 'monospace', m: 0, columnCount: 2, maxWidth: 360 }} data-testid="backup-codes">
              {backup.join('\n')}
            </Box>
            <Button variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => { setBackup(null); router.push(back); router.refresh(); }}>
              OK
            </Button>
          </Stack>
        )}
        {status.enrolled && !backup && (
          <Stack spacing={2} sx={{ maxWidth: 360 }}>
            <Typography variant="body2">{t('security.mfa.codesLeft', { n: status.backupCodesLeft })}</Typography>
            <TextField size="small" label={t('security.mfa.code')} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" disabled={pending || code.trim().length < 6} onClick={() => run(async () => { const r = await newBackupCodes(code); if (r.ok) setBackup(r.data.backupCodes); return r; }, () => setCode(''))}>
                {t('security.mfa.newCodes')}
              </Button>
              {!status.required && (
                <Button color="error" disabled={pending || code.trim().length < 6} onClick={() => run(() => disableMfa(code), () => setCode(''))}>
                  {t('security.mfa.disable')}
                </Button>
              )}
            </Box>
          </Stack>
        )}
      </Card>

      <Card sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="h2">
            {t('security.sessions')}
          </Typography>
          {sessions.length > 1 && (
            <Button size="small" disabled={pending} onClick={() => run(revokeOtherSessions)}>
              {t('security.sessions.signOutOthers')}
            </Button>
          )}
        </Box>
        <Stack spacing={1.5} data-testid="sessions">
          {sessions.map((s) => (
            <Box key={s.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2">
                  {s.label} {s.current && <Chip size="small" label={t('security.sessions.thisDevice')} sx={{ ml: 0.5 }} />}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('security.sessions.lastSeen')}: {fmt.dateTime(s.lastSeenAt)}
                  {s.ip ? ` · ${s.ip}` : ''}
                </Typography>
              </Box>
              {!s.current && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => revokeSession(s.id))}>
                  {t('security.sessions.signOut')}
                </Button>
              )}
            </Box>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
