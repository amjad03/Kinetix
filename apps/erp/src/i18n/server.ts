import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getMe } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/config';
import { createFormat, type I18n } from './format';
import { fromAcceptLanguage, isLocale, LANG_COOKIE, type Locale } from './locales';
import { MESSAGES } from './messages';
import { createT } from './translate';

/**
 * The ERP language for this request: the language picked on this browser (cookie), else the
 * signed-in user's preferredLanguage, else the browser's Accept-Language (hi / kn), else English.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const picked = jar.get(LANG_COOKIE)?.value;
  if (isLocale(picked)) return picked;
  if (jar.get(SESSION_COOKIE)) {
    try {
      const me = await getMe();
      if (isLocale(me.preferredLanguage)) return me.preferredLanguage;
    } catch {
      // The page's own getMe() shows the error or ends the session.
    }
  }
  return fromAcceptLanguage((await headers()).get('accept-language')) ?? 'en';
});

/** `t()` and formatters for server components and server actions. */
export const getI18n = cache(async (): Promise<I18n> => {
  const locale = await getLocale();
  const t = createT(locale, MESSAGES[locale]);
  return { locale, t, fmt: createFormat(locale, t) };
});
