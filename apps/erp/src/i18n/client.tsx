'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createFormat, type I18n } from './format';
import type { Locale } from './locales';
import type { Messages } from './messages';
import { createT } from './translate';

const Ctx = createContext<{ locale: Locale; messages: Messages } | null>(null);

/** Gives client components the language and its dictionary (sent once from the root layout). */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `t()` and formatters for client components. */
export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return useMemo(() => {
    const t = createT(ctx.locale, ctx.messages);
    return { locale: ctx.locale, t, fmt: createFormat(ctx.locale, t) };
  }, [ctx]);
}
