import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { api, getMe } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/config';
import { createFormat, type I18n } from './format';
import { applyTerminology } from './terminology';
import { applySchoolWording, isSchoolModel } from './school-wording';
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

/** The institution's capabilities that shape wording (empty when signed out or on any failure). */
const getWordingProfile = cache(async (): Promise<{ terminology: Record<string, string>; academicModel?: string; tenantKind?: string | null }> => {
  if (!(await cookies()).get(SESSION_COOKIE)) return { terminology: {} };
  try {
    const c = await api<{ terminology?: Record<string, string>; academicModel?: string; tenantKind?: string | null }>('/v1/institution/capabilities');
    return { terminology: c.terminology ?? {}, academicModel: c.academicModel, tenantKind: c.tenantKind };
  } catch {
    return { terminology: {} };
  }
});

/** The institution's own wording for what the ERP calls things (empty when signed out or on any failure). */
export const getTerminology = cache(async (): Promise<Record<string, string>> => (await getWordingProfile()).terminology);

/** True for a school tenant: Class / Section / Term / Subject instead of Programme / Semester / Course. */
export const isSchoolTenant = cache(async (): Promise<boolean> => isSchoolModel((await getWordingProfile()).academicModel, (await getWordingProfile()).tenantKind));

/** The dictionary for this request: the language's strings, school wording for a school, the institution's wording on top. */
export const getMessages = cache(async () => {
  const locale = await getLocale();
  const base = (await isSchoolTenant()) ? applySchoolWording(MESSAGES[locale], locale) : MESSAGES[locale];
  return applyTerminology(base, await getTerminology());
});

/** `t()` and formatters for server components and server actions. */
export const getI18n = cache(async (): Promise<I18n> => {
  const locale = await getLocale();
  const t = createT(locale, await getMessages());
  return { locale, t, fmt: createFormat(locale, t) };
});
