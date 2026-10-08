'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getI18n } from '@/i18n/server';
import { api, ApiError } from '@/lib/api';
import { CAST_COOKIE, SESSION_MAX_AGE, TENANT_COOKIE } from '@/lib/config';
import { secureCookies } from '@/lib/session';
import type { LoginResponse, MfaChallenge } from '@/lib/types';

export interface CastSignInState {
  error?: string;
  fields?: { tenant: string; login: string };
}

/** Sign-in for the cast page. Teachers and students may use it; the token is kept apart from the ERP's session. */
export async function castSignIn(_prev: CastSignInState, form: FormData): Promise<CastSignInState> {
  const { t } = await getI18n();
  const tenant = String(form.get('tenant') ?? '').trim().toLowerCase();
  const login = String(form.get('login') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const fields = { tenant, login };
  if (!tenant || !login || !password) return { error: t('cast.err.missing'), fields };
  let res: LoginResponse | MfaChallenge;
  try {
    res = await api<LoginResponse | MfaChallenge>('/v1/auth/login', { method: 'POST', body: { tenant, login, password }, anonymous: true });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 400)) return { error: t('cast.err.wrong'), fields };
    return { error: t('cast.err.failed'), fields };
  }
  if ('mfaRequired' in res) return { error: t('cast.err.mfa'), fields };
  if (res.mustChangePassword) return { error: t('cast.err.failed'), fields };
  if (!res.user.roles.some((r) => ['teacher', 'hod', 'principal', 'student'].includes(r))) return { error: t('cast.err.role'), fields };
  const jar = await cookies();
  jar.set(TENANT_COOKIE, tenant, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: 365 * 86_400 });
  jar.set(CAST_COOKIE, res.accessToken, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: SESSION_MAX_AGE });
  redirect('/cast');
}

export async function castSignOut() {
  (await cookies()).delete(CAST_COOKIE);
  redirect('/cast');
}
