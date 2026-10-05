'use server';

import { redirect, unstable_rethrow } from 'next/navigation';
import { errorText } from '@/i18n/errors';
import { getI18n } from '@/i18n/server';
import { landingFor } from '@/lib/access';
import { api, ApiError, getMe } from '@/lib/api';
import { MIN_PASSWORD_LENGTH, passwordIssue } from '@/lib/password';
import { storeSession } from '@/lib/session';
import type { PasswordChangedResponse } from '@/lib/types';

export interface ChangePasswordState {
  error?: string;
}

/** POST /v1/me/password, then keeps the new token (without the temporary-password limit) and continues. */
export async function changePassword(_prev: ChangePasswordState, form: FormData): Promise<ChangePasswordState> {
  const { t } = await getI18n();
  const me = await getMe();
  const current = me.hasPassword === false ? undefined : String(form.get('current') ?? '');
  const next = String(form.get('new') ?? '');
  const issue = passwordIssue({ current, next, confirm: String(form.get('confirm') ?? ''), email: me.email });
  if (issue) return { error: issue === 'tooShort' ? t('account.password.tooShort', { n: MIN_PASSWORD_LENGTH }) : t(`account.password.${issue}`) };

  let res: PasswordChangedResponse;
  try {
    res = await api<PasswordChangedResponse>('/v1/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof ApiError ? errorText(e, t) : t('error.generic') };
  }
  await storeSession(res.accessToken);
  redirect(landingFor(me.roles, String(form.get('next') ?? '')));
}
