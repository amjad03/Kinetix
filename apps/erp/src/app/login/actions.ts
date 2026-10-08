'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getI18n } from '@/i18n/server';
import { errorText } from '@/i18n/errors';
import { api, ApiError } from '@/lib/api';
import { SESSION_COOKIE, TENANT_COOKIE } from '@/lib/config';
import { canUseErp, landingFor } from '@/lib/access';
import { changePasswordUrl } from '@/lib/password';
import { secureCookies, storeSession } from '@/lib/session';
import type { LoginResponse, MfaChallenge } from '@/lib/types';

export interface LoginState {
  error?: string;
  /** Set after a correct password for a user with two-step sign-in: the form then asks for the code. */
  mfaToken?: string;
  fields?: { tenant: string; login: string };
}

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const mfaToken = String(form.get('mfaToken') ?? '');
  if (mfaToken) return verifyCode(mfaToken, form);
  const tenant = String(form.get('tenant') ?? '').trim().toLowerCase();
  const login = String(form.get('login') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const fields = { tenant, login };
  const { t } = await getI18n();
  if (!tenant || !login || !password) return { error: t('login.missing'), fields };

  let res: LoginResponse | MfaChallenge;
  try {
    res = await api<LoginResponse | MfaChallenge>('/v1/auth/login', { method: 'POST', body: { tenant, login, password }, anonymous: true });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'AUTH_INACTIVE') return { error: t('error.AUTH_INACTIVE'), fields };
    if (e instanceof ApiError && (e.status === 401 || e.status === 400)) return { error: t('error.AUTH_WRONG_LOGIN'), fields };
    return { error: e instanceof ApiError ? errorText(e, t) : t('login.failed'), fields };
  }
  (await cookies()).set(TENANT_COOKIE, tenant, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: 365 * 86_400 });
  if ('mfaRequired' in res) return { mfaToken: res.mfaToken, fields };
  return finish(res, form);
}

/** Second step: the code from the authenticator app (or a backup code). */
async function verifyCode(mfaToken: string, form: FormData): Promise<LoginState> {
  const { t } = await getI18n();
  const code = String(form.get('code') ?? '').trim();
  if (!code) return { mfaToken, error: t('login.missing') };
  let res: LoginResponse;
  try {
    res = await api<LoginResponse>('/v1/auth/mfa/verify', { method: 'POST', body: { mfaToken, code }, anonymous: true });
  } catch (e) {
    // The challenge lives five minutes: after that (or after too many tries) start again.
    if (e instanceof ApiError && e.status === 401 && e.code !== 'MFA_CODE_INVALID') return { error: t('login.failed') };
    return { mfaToken, error: e instanceof ApiError ? errorText(e, t) : t('login.failed') };
  }
  return finish(res, form);
}

async function finish(res: LoginResponse, form: FormData): Promise<LoginState> {
  const { t } = await getI18n();
  if (!canUseErp(res.user.roles)) return { error: t('login.notForRole') };
  await storeSession(res.accessToken);
  const next = String(form.get('next') ?? '');
  // A temporary password (new institution, or reset by the principal): choose a new one before anything else.
  if (res.mustChangePassword) redirect(changePasswordUrl(next));
  // The institution requires two-step sign-in for this role: set it up before anything else.
  if (res.mustSetUpMfa) redirect('/account/security');
  redirect(landingFor(res.user.roles, next));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login?reason=signed-out');
}
