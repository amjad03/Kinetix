'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MfaStatus, SessionRow } from '@/lib/insights';
import { confirmMfa, disableMfa, newBackupCodes, revokeOtherSessions, revokeSession, startMfa } from './actions';

import { Alert, Button, Card, Chip } from '@/components/kx';
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
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
            {t('security.mfa.title')}
          </h2>
          <Chip size="small" color={status.enrolled ? 'success' : 'default'} label={status.enrolled ? t('security.mfa.statusOn') : t('security.mfa.statusOff')} />
        </div>
        {!status.enrolled && status.required && <Alert className="mb-4" severity="warning">{t('security.mfa.required')}</Alert>}
        <p className="text-[13px] leading-[19px] text-muted-foreground mb-4">
          {status.enrolled ? t('security.mfa.on') : t('security.mfa.off')}
        </p>

        {!status.enrolled && !setup && (
          <Button variant="contained" disabled={pending} onClick={() => run(async () => { const r = await startMfa(); if (r.ok) setSetup(r.data); return r; })}>
            {t('security.mfa.start')}
          </Button>
        )}
        {setup && !backup && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await confirmMfa(code); if (r.ok) setBackup(r.data.backupCodes); return r; }, () => setSetup(null)); }}>
            <p className="text-[13px] leading-[19px]">{t('security.mfa.secret')}</p>
            <code className="font-mono text-[1.1rem] tracking-[2px] break-all" data-testid="mfa-secret">
              {setup.secret}
            </code>
            <Button className="self-start" href={setup.otpauthUri} size="small">
              {t('security.mfa.open')}
            </Button>
            <FormField label={t('security.mfa.code')}>
              <TextInput className="max-w-[240px]" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            </FormField>
            <Button className="self-start" type="submit" variant="contained" disabled={pending || code.trim().length < 6}>
              {t('security.mfa.confirm')}
            </Button>
          </form>
        )}
        {backup && (
          <div className="flex flex-col gap-3">
            <Alert severity="info">{t('security.mfa.backup')}</Alert>
            <pre className="font-mono m-0 columns-2 max-w-[360px]" data-testid="backup-codes">
              {backup.join('\n')}
            </pre>
            <Button className="self-start" variant="contained" onClick={() => { setBackup(null); router.push(back); router.refresh(); }}>
              OK
            </Button>
          </div>
        )}
        {status.enrolled && !backup && (
          <div className="flex flex-col gap-4 max-w-[360px]">
            <p className="text-[13px] leading-[19px]">{t('security.mfa.codesLeft', { n: status.backupCodesLeft })}</p>
            <FormField label={t('security.mfa.code')}>
              <TextInput value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            </FormField>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outlined" disabled={pending || code.trim().length < 6} onClick={() => run(async () => { const r = await newBackupCodes(code); if (r.ok) setBackup(r.data.backupCodes); return r; }, () => setCode(''))}>
                {t('security.mfa.newCodes')}
              </Button>
              {!status.required && (
                <Button color="error" disabled={pending || code.trim().length < 6} onClick={() => run(() => disableMfa(code), () => setCode(''))}>
                  {t('security.mfa.disable')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
          <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
            {t('security.sessions')}
          </h2>
          {sessions.length > 1 && (
            <Button size="small" disabled={pending} onClick={() => run(revokeOtherSessions)}>
              {t('security.sessions.signOutOthers')}
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-3" data-testid="sessions">
          {sessions.map((s) => (
            <div className="flex justify-between items-center gap-2" key={s.id}>
              <div className="min-w-0">
                <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">
                  {s.label} {s.current && <Chip className="ml-1" size="small" label={t('security.sessions.thisDevice')} />}
                </h6>
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {t('security.sessions.lastSeen')}: {fmt.dateTime(s.lastSeenAt)}
                  {s.ip ? ` · ${s.ip}` : ''}
                </span>
              </div>
              {!s.current && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => revokeSession(s.id))}>
                  {t('security.sessions.signOut')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
