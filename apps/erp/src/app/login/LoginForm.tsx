'use client';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { setLanguage } from '@/app/language/actions';
import { useI18n } from '@/i18n/client';
import { BCP47, LANGUAGE_NAMES, LOCALES } from '@/i18n/locales';
import { LogoMark } from '@/components/Logo';
import { signIn, type LoginState } from './actions';

import { Alert, Button, CircularProgress, IconButton, InputAdornment } from '@/components/kx';
import { Eye as VisibilityOutlined, EyeOff as VisibilityOffOutlined } from 'lucide-react';
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
    <main className="min-h-[100dvh] grid place-items-center bg-muted p-4"
    >
      <div className="w-full max-w-[1040px] bg-card rounded-[28px] p-6 sm:p-10 grid grid-cols-[1fr] md:grid-cols-[1fr_1fr] gap-x-12 gap-y-6"
      >
        <div>
          <LogoMark size={48} />
          <h1 className="font-display mt-6 text-[2rem] md:text-[2.25rem] leading-[44px]">
            {t('login.title')}
          </h1>
          <p className="text-sm leading-[21px] mt-4 text-muted-foreground max-w-[380px]">
            {t('login.lead')}
          </p>
          <div className="flex gap-1 mt-6 -ml-2 flex-wrap" role="group" aria-label={t('shell.language')}>
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
          </div>
        </div>

        <form action={action} noValidate>
          <input type="hidden" name="next" value={next ?? ''} />
          <div className="flex flex-col gap-5">
            {notice && !state.error && <Alert severity={notice.severity}>{notice.text}</Alert>}
            {state.error && (
              <Alert severity="error" role="alert">
                {state.error}
              </Alert>
            )}
            {state.mfaToken ? (
              <>
                <input type="hidden" name="mfaToken" value={state.mfaToken} />
                <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
                  {t('login.mfa.title')}
                </h2>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {t('login.mfa.lead')}
                </p>
                <FormField label={t('login.mfa.code')} required>
                  <TextInput name="code" autoComplete="one-time-code" autoFocus required slotProps={{ htmlInput: { inputMode: 'numeric', autoCapitalize: 'none', spellCheck: false } }} />
                </FormField>
                <div className="flex justify-end pt-4">
                  <Button className="min-w-[104px]" type="submit" variant="contained" disabled={pending}>
                    {pending ? <CircularProgress size={20} color="inherit" aria-label={t('login.signingIn')} /> : t('login.mfa.submit')}
                  </Button>
                </div>
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
            <div className="flex justify-between items-center pt-4 gap-4">
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t('login.forgot')}
              </p>
              <Button className="min-w-[104px]" type="submit" variant="contained" disabled={pending}>
                {pending ? <CircularProgress size={20} color="inherit" aria-label={t('login.signingIn')} /> : t('login.submit')}
              </Button>
            </div>
              </>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
