// The ERP's languages. Server content (names, titles) is shown as the API sends it.

export const LOCALES = ['en', 'hi', 'kn'] as const;
export type Locale = (typeof LOCALES)[number];

/** Language picked on this browser (the language menu). Wins over the account's preferredLanguage. */
export const LANG_COOKIE = 'kx_lang';

/** BCP 47 tags for Intl date formatting and `<html lang>`. */
export const BCP47: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };

/**
 * Numbers and money use Indian grouping (12,34,567) and Western digits in every language.
 * ICU's kn-IN groups in thousands (1,234,567), so Kannada formats numbers with en-IN, which
 * gives the same digits with lakh grouping.
 */
export const NUMBER_LOCALE: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'en-IN' };

/** Each language in its own script, for the language menu. */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', hi: 'हिन्दी', kn: 'ಕನ್ನಡ' };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** The first of hi / kn / en in an Accept-Language header (before sign-in). */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if (isLocale(tag)) return tag;
  }
  return null;
}
