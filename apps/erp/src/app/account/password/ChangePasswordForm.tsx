'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { signOut } from '@/app/login/actions';
import { AuthShell } from '@/components/auth/AuthShell';
import { useI18n } from '@/i18n/client';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';
import { changePassword, type ChangePasswordState } from './actions';

import { Alert, Button, CircularProgress, IconButton, InputAdornment } from '@/components/kx';
import { Eye as VisibilityOutlined, EyeOff as VisibilityOffOutlined } from 'lucide-react';
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
    <AuthShell title={forced ? t('v2.auth.setupArt') : t('account.password.title')} lead={t('v2.auth.setupArtLead')} cardTitle={t('v2.auth.setupCard')} cardText={t('v2.auth.setupCardText')}>
        <div>
          {forced && (
            <ol className="mb-4 flex gap-2 text-xs font-medium" aria-label={t('v2.auth.setupSteps')} data-testid="setup-steps">
              {[t('v2.auth.step1'), t('v2.auth.step2'), t('v2.auth.step3')].map((s, i) => (
                <li key={s} className={i === 0 ? 'flex-1 rounded-full bg-teal-soft px-2 py-1 text-center text-teal-ink' : 'flex-1 rounded-full bg-muted px-2 py-1 text-center text-muted-foreground'}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          )}
          <h1 className="m-0 text-[26px] font-semibold tracking-tight">
            {forced ? t('account.password.forcedTitle') : t('account.password.title')}
          </h1>
          <p className="text-sm leading-[21px] mt-4 text-muted-foreground max-w-[420px]">
            {forced ? t('account.password.forcedLead') : hasPassword ? t('account.password.lead') : t('account.password.firstLead')}
          </p>
          <p className="text-[13px] leading-[19px] mt-6 font-medium">
            {t('account.password.rules')}
          </p>
          <ul className="mt-2 pl-5 text-muted-foreground text-[13px] leading-[19px] [&_li]:mb-1" data-testid="password-rules">
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        <form action={action} noValidate>
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-col gap-5">
            {state.error && (
              <Alert severity="error" role="alert" data-testid="password-error">
                {state.error}
              </Alert>
            )}
            {hasPassword && (
              <FormField label={forced ? t('account.password.temporary') : t('account.password.current')} required>
                <TextInput
                  name="current"
                  type={type}
                  autoComplete="current-password"
                  required
                  autoFocus
                  slotProps={{ input: { endAdornment: toggle } }}
                />
              </FormField>
            )}
            <FormField label={t('account.password.new')} required>
              <TextInput name="new" type={type} autoComplete="new-password" required autoFocus={!hasPassword} slotProps={{ htmlInput: { minLength: MIN_PASSWORD_LENGTH } }} />
            </FormField>
            <FormField label={t('account.password.confirm')} required>
              <TextInput name="confirm" type={type} autoComplete="new-password" required />
            </FormField>
            <div className="flex justify-end items-center pt-4 gap-2">
              {forced ? (
                <Button type="submit" formAction={signOut} formNoValidate variant="text">
                  {t('shell.signOut')}
                </Button>
              ) : (
                <Button component={Link} href={back} variant="text">
                  {t('account.password.back')}
                </Button>
              )}
              <Button className="min-w-[104px]" type="submit" variant="contained" disabled={pending}>
                {pending ? <CircularProgress size={20} color="inherit" aria-label={t('account.password.saving')} /> : t('account.password.submit')}
              </Button>
            </div>
          </div>
        </form>
    </AuthShell>
  );
}
