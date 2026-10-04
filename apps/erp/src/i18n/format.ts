import { daysBetween, formatDate, formatDateTime, formatMonth, formatTime, relativeTime } from '@/lib/dates';
import { formatRupees, formatRupeesShort } from '@/lib/money';
import { NUMBER_LOCALE, type Locale } from './locales';
import type { TFunction } from './translate';

const SCHOOL_TZ = 'Asia/Kolkata';

/** Dates, times, numbers and money in the ERP language: en-IN / hi-IN / kn-IN, Western digits, Indian grouping. */
export interface Fmt {
  locale: Locale;
  /** A calendar date (YYYY-MM-DD). */
  date(date: string, style?: 'long' | 'short' | 'weekday' | 'day' | 'dayMonth'): string;
  /** "October 2026". */
  month(date: string): string;
  dateTime(iso: string, timeZone?: string, withTime?: boolean): string;
  time(iso: string, timeZone?: string): string;
  /** "3 min ago", "yesterday"… */
  relative(iso: string, now?: Date, timeZone?: string): string;
  /** "Yesterday", "In 2 days"… relative to today (both YYYY-MM-DD). */
  relativeDay(date: string, today: string): string;
  number(n: number, opts?: Intl.NumberFormatOptions): string;
  rupees(paise: number): string;
  rupeesShort(paise: number): string;
}

export function createFormat(locale: Locale, t: TFunction): Fmt {
  const nl = NUMBER_LOCALE[locale];
  return {
    locale,
    date: (date, style = 'long') => formatDate(date, style, locale),
    month: (date) => formatMonth(date, locale),
    dateTime: (iso, timeZone = SCHOOL_TZ, withTime = true) => formatDateTime(iso, timeZone, withTime, locale),
    time: (iso, timeZone = SCHOOL_TZ) => formatTime(iso, timeZone, locale),
    relative: (iso, now = new Date(), timeZone = SCHOOL_TZ) => relativeTime(iso, now, timeZone, t),
    relativeDay: (date, today) => {
      const n = daysBetween(today, date);
      if (n === 0) return t('time.today');
      if (n === -1) return t('time.yesterdayDay');
      if (n === 1) return t('time.tomorrow');
      return n < 0 ? t.plural('time.daysAgo', -n) : t.plural('time.inDaysDay', n);
    },
    number: (n, opts) => new Intl.NumberFormat(nl, opts).format(n),
    rupees: (paise) => formatRupees(paise),
    rupeesShort: (paise) => formatRupeesShort(paise, { lakh: t('money.lakh'), crore: t('money.crore') }),
  };
}

export interface I18n {
  locale: Locale;
  t: TFunction;
  fmt: Fmt;
}
