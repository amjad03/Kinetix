'use client';
import { Building2, ChevronLeft, Eye, EyeOff, Lock, Mail, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState, useTransition, type ReactNode } from 'react';
import { setLanguage } from '@/app/language/actions';
import { OtpBoxesClient } from '@/components/auth/OtpBoxes';
import { Alert, AlertDescription } from '@/components/shadcn/alert';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { useI18n } from '@/i18n/client';
import { BCP47, LANGUAGE_NAMES, LOCALES } from '@/i18n/locales';
import { cn } from '@/lib/utils';
import { otpSignIn, signIn, type LoginState } from './actions';

export type LoginMode = 'password' | 'otp' | 'forgot';

const GOOGLE = (
  <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
const MICROSOFT = (
  <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

function Field({ id, label, icon, aside, children }: { id?: string; label: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-[13px]">
          {label}
        </Label>
        {aside}
      </div>
      <div className="relative [&>input]:h-10 [&>input]:pl-9">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&>svg]:size-4">{icon}</span>
        {children}
      </div>
    </div>
  );
}

export function LoginForm({ defaultTenant, notice, next, mode: initial = 'password' }: { defaultTenant: string; notice?: { severity: 'info' | 'warning'; text: string }; next?: string; mode?: LoginMode }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [otp, otpAction, otpPending] = useActionState<LoginState, FormData>(otpSignIn, {});
  const [mode, setMode] = useState<LoginMode>(initial);
  const [by, setBy] = useState<'email' | 'phone'>('email');
  const [show, setShow] = useState(false);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const tenantRef = useRef<HTMLInputElement>(null);

  const sso = () => {
    const tenant = (tenantRef.current?.value ?? defaultTenant).trim().toLowerCase();
    // A route handler that redirects to the identity provider: a full navigation, not a client route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login/sso?tenant=${encodeURIComponent(tenant)}`;
  };
  const tenantField = (value: string) => (
    <Field id="kx-tenant" label={t('login.tenant')} icon={<Building2 />}>
      <Input ref={tenantRef} id="kx-tenant" name="tenant" defaultValue={value} autoComplete="organization" required autoCapitalize="none" spellCheck={false} autoFocus={!value} data-testid="login-tenant" />
    </Field>
  );
  const err = (s: LoginState) =>
    s.error ? (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{s.error}</AlertDescription>
      </Alert>
    ) : null;
  const back = (
    <Button type="button" variant="ghost" className="self-start" onClick={() => setMode('password')}>
      <ChevronLeft />
      {t('v2.auth.back')}
    </Button>
  );

  // Two-step sign-in: the authenticator code.
  if (state.mfaToken) {
    return (
      <form action={action} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next ?? ''} />
        <input type="hidden" name="mfaToken" value={state.mfaToken} />
        <h1 className="m-0 text-[26px] font-semibold tracking-tight">{t('v2.auth.verifyTitle')}</h1>
        <p className="-mt-2 text-muted-foreground">{t('login.mfa.lead')}</p>
        {err(state)}
        <Field id="kx-code" label={t('login.mfa.code')}>
          <Input id="kx-code" name="code" autoComplete="one-time-code" inputMode="numeric" autoFocus required className="pl-3!" />
        </Field>
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? t('login.signingIn') : t('login.mfa.submit')}
        </Button>
      </form>
    );
  }

  if (mode === 'otp' || mode === 'forgot') {
    const sent = !!otp.otpPhone;
    return (
      <form action={otpAction} noValidate className="flex flex-col gap-4" data-testid="otp-form">
        <input type="hidden" name="next" value={next ?? ''} />
        <h1 className="m-0 text-[26px] font-semibold tracking-tight">{sent ? t('v2.auth.verifyTitle') : mode === 'forgot' ? t('v2.auth.forgotTitle') : t('v2.auth.otpTitle')}</h1>
        <p className="-mt-2 text-muted-foreground">{sent ? t('v2.auth.codeSent', { phone: otp.otpPhone ?? '' }) : mode === 'forgot' ? t('v2.auth.forgotLead') : t('v2.auth.otpLead')}</p>
        {err(otp)}
        {sent ? (
          <>
            <input type="hidden" name="tenant" value={otp.fields?.tenant ?? ''} />
            <input type="hidden" name="phone" value={otp.otpPhone} />
            <div className="grid gap-1.5">
              <Label className="text-[13px]">{t('v2.auth.code')}</Label>
              <OtpBoxesClient name="code" label={t('v2.auth.code')} />
            </div>
            <Button type="submit" disabled={otpPending} className="h-10" data-testid="otp-verify">
              {otpPending ? t('login.signingIn') : t('v2.auth.verify')}
            </Button>
          </>
        ) : (
          <>
            {tenantField(otp.fields?.tenant ?? defaultTenant)}
            <Field id="kx-phone" label={t('v2.auth.phone')} icon={<Smartphone />}>
              <Input id="kx-phone" name="phone" type="tel" defaultValue={otp.fields?.login ?? ''} autoComplete="tel" placeholder="+91 98xxx xxxxx" required autoFocus={!!defaultTenant} />
            </Field>
            <Button type="submit" disabled={otpPending} className="h-10" data-testid="otp-send">
              {t('v2.auth.sendCode')}
            </Button>
            {mode === 'forgot' && <p className="text-xs text-muted-foreground">{t('v2.auth.forgotNote')}</p>}
          </>
        )}
        {mode === 'forgot' ? (
          <Button asChild variant="ghost" className="self-start">
            <Link href="/login">
              <ChevronLeft />
              {t('v2.auth.back')}
            </Link>
          </Button>
        ) : (
          back
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-tight">{t('v2.auth.signInTitle')}</h1>
        <p className="mt-1 text-muted-foreground">{t('v2.auth.signInLead')}</p>
      </div>
      {notice && !state.error && (
        <Alert>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      {err(state)}
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="outline" onClick={sso} data-testid="sso-google">
          {GOOGLE}
          Google
        </Button>
        <Button type="button" variant="outline" onClick={sso} data-testid="sso-microsoft">
          {MICROSOFT}
          Microsoft
        </Button>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">{t('v2.auth.orContinue')}</div>
      <form action={action} noValidate className="flex flex-col gap-3.5">
        <input type="hidden" name="next" value={next ?? ''} />
        {tenantField(state.fields?.tenant ?? defaultTenant)}
        <Field
          id="kx-login"
          label={by === 'email' ? t('v2.auth.email') : t('v2.auth.phone')}
          icon={by === 'email' ? <Mail /> : <Smartphone />}
          aside={
            <div role="group" aria-label={t('v2.auth.signInWith')} className="flex rounded-md border p-0.5 text-xs">
              {(['email', 'phone'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={by === m} onClick={() => setBy(m)} className={cn('rounded px-2 py-0.5', by === m ? 'bg-muted font-semibold' : 'text-muted-foreground')}>
                  {m === 'email' ? t('v2.auth.email') : t('v2.auth.phone')}
                </button>
              ))}
            </div>
          }
        >
          <Input id="kx-login" name="login" defaultValue={state.fields?.login ?? ''} type={by === 'email' ? 'email' : 'tel'} autoComplete="username" required autoCapitalize="none" spellCheck={false} autoFocus={!!defaultTenant} data-testid="login-login" />
        </Field>
        <Field
          id="kx-password"
          label={t('login.password')}
          icon={<Lock />}
          aside={
            <Link href="/login/forgot" className="text-xs font-medium text-teal-ink hover:underline">
              {t('v2.auth.forgotLink')}
            </Link>
          }
        >
          <Input id="kx-password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="pr-10" data-testid="login-password" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t('login.hide') : t('login.show')} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted [&>svg]:size-4">
            {show ? <EyeOff /> : <Eye />}
          </button>
        </Field>
        <Button type="submit" disabled={pending} className="mt-1 h-10" data-testid="login-submit">
          {pending ? t('login.signingIn') : t('login.submit')}
        </Button>
      </form>
      <Button type="button" variant="outline" className="h-10" onClick={() => setMode('otp')} data-testid="login-otp">
        <Smartphone />
        {t('v2.auth.useOtp')}
      </Button>
      <div className="flex flex-wrap justify-center gap-1" role="group" aria-label={t('shell.language')}>
        {LOCALES.map((l) => (
          <Button
            key={l}
            size="sm"
            lang={BCP47[l]}
            variant={l === locale ? 'secondary' : 'ghost'}
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
  );
}
