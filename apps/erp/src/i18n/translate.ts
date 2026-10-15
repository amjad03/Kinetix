import { NUMBER_LOCALE, BCP47, type Locale } from './locales';
import type { MessageKey, Messages, PluralKey } from './messages';

export type Vars = Record<string, string | number>;

export interface TFunction {
  (key: MessageKey, vars?: Vars): string;
  /** `key_one` or `key_other` by the language's plural rules; `{count}` is set to n. */
  plural(key: PluralKey, count: number, vars?: Vars): string;
  locale: Locale;
}

/** Replaces `{name}` with vars.name. Numbers are formatted with Indian grouping, except a year ("2026", not "2,026"). */
export function interpolate(text: string, vars: Vars | undefined, locale: Locale): string {
  if (!vars) return text;
  const nf = new Intl.NumberFormat(NUMBER_LOCALE[locale], { maximumFractionDigits: 2 });
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name];
    if (v === undefined) return m;
    if (typeof v === 'number' && /year/i.test(name) && Number.isInteger(v)) return String(v);
    return typeof v === 'number' ? nf.format(v) : v;
  });
}

/** A translator over one language's dictionary (kept free of the dictionaries, so client bundles carry only one). */
export function createT(locale: Locale, messages: Messages): TFunction {
  const rules = new Intl.PluralRules(BCP47[locale]);
  const t = ((key: MessageKey, vars?: Vars) => interpolate(messages[key] ?? key, vars, locale)) as TFunction;
  t.plural = (key, count, vars) => {
    const form = rules.select(count) === 'one' ? 'one' : 'other';
    return t(`${key}_${form}` as MessageKey, { count, ...vars });
  };
  t.locale = locale;
  return t;
}
