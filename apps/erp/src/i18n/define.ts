/**
 * One area of the dictionary: English strings and their Hindi and Kannada translations.
 * TypeScript refuses a translation that misses or adds a key; `i18n.test.ts` also checks
 * placeholders and that no key is defined twice across areas.
 */
export function area<const E extends Record<string, string>>(en: E, tr: { hi: Record<keyof E, string>; kn: Record<keyof E, string> }) {
  return { en, hi: tr.hi, kn: tr.kn };
}
