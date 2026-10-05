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
import type { LoginResponse } from '@/lib/types';

export interface LoginState {
  error?: string;
  fields?: { tenant: string; login: string };
}

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const tenant = String(form.get('tenant') ?? '').trim().toLowerCase();
  const login = String(form.get('login') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const fields = { tenant, login };
  const { t } = await getI18n();
  if (!tenant || !login || !password) return { error: t('login.missing'), fields };

  let res: LoginResponse;
  try {
    res = await api<LoginResponse>('/v1/auth/login', { method: 'POST', body: { tenant, login, password }, anonymous: true });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'AUTH_INACTIVE') return { error: t('error.AUTH_INACTIVE'), fields };
    if (e instanceof ApiError && (e.status === 401 || e.status === 400)) return { error: t('error.AUTH_WRONG_LOGIN'), fields };
    return { error: e instanceof ApiError ? errorText(e, t) : t('login.failed'), fields };
  }
  if (!canUseErp(res.user.roles)) return { error: t('login.notForRole'), fields };

  await storeSession(res.accessToken);
  // Not secret: lets the sign-in page remember the institution code.
  (await cookies()).set(TENANT_COOKIE, tenant, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: 365 * 86_400 });
  const next = String(form.get('next') ?? '');
  // A temporary password (new institution, or reset by the principal): choose a new one before anything else.
  if (res.mustChangePassword) redirect(changePasswordUrl(next));
  redirect(landingFor(res.user.roles, next));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login?reason=signed-out');
}
