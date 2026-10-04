'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLocale, LANG_COOKIE, type Locale } from '@/i18n/locales';
import { api } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/config';

/**
 * The language menu: remembers the language on this browser (a cookie, a year) and, when
 * signed in, saves it to the account (PATCH /v1/me) so notifications use it too. Saving to the
 * account is best effort: the ERP switches language either way.
 */
export async function setLanguage(locale: Locale): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production' && process.env.KINETIX_INSECURE_COOKIES !== '1';
  jar.set(LANG_COOKIE, locale, { sameSite: 'lax', secure, path: '/', maxAge: 365 * 86_400 });
  let saved = true;
  if (jar.get(SESSION_COOKIE)) {
    try {
      await api('/v1/me', { method: 'PATCH', body: { preferredLanguage: locale } });
    } catch {
      saved = false;
    }
  }
  revalidatePath('/', 'layout');
  return { ok: saved };
}
