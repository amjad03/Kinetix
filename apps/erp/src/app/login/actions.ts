'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { SESSION_COOKIE, SESSION_MAX_AGE, TENANT_COOKIE } from '@/lib/config';
import { DASHBOARD_ROLES, type LoginResponse } from '@/lib/types';

export interface LoginState {
  error?: string;
  fields?: { tenant: string; login: string };
}

const NOT_FOR_ROLE =
  "KINETIX ERP is for principals, administrators and heads of department. Teachers can use the KINETIX Teacher App; students and parents, their own apps.";

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const tenant = String(form.get('tenant') ?? '').trim().toLowerCase();
  const login = String(form.get('login') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const fields = { tenant, login };
  if (!tenant || !login || !password) return { error: 'Enter your institution code, email or phone, and password.', fields };

  let res: LoginResponse;
  try {
    res = await api<LoginResponse>('/v1/auth/login', { method: 'POST', body: { tenant, login, password }, anonymous: true });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 400)) return { error: 'Wrong institution code, login or password.', fields };
    return { error: e instanceof ApiError ? e.message : 'Sign-in failed. Try again.', fields };
  }
  if (!res.user.roles.some((r) => DASHBOARD_ROLES.includes(r))) return { error: NOT_FOR_ROLE, fields };

  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production' && process.env.KINETIX_INSECURE_COOKIES !== '1';
  jar.set(SESSION_COOKIE, res.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_MAX_AGE });
  // Not secret: lets the sign-in page remember the institution code.
  jar.set(TENANT_COOKIE, tenant, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 365 * 86_400 });
  const next = String(form.get('next') ?? '/');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login?reason=signed-out');
}
