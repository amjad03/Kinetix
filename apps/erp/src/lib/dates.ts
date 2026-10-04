// Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings in the school's time zone.
// Formatting takes the ERP language (en-IN, hi-IN, kn-IN; Western digits in all three).
//
// Hindi and Kannada month and weekday names come from our own tables, not Intl: Node and the
// browser ship different ICU data ("अक्टू॰" on the server, "अक्तू॰" in Chrome), which would
// make server-rendered client components fail to hydrate. English uses Intl en-IN.

import { BCP47, type Locale } from '@/i18n/locales';
import type { TFunction } from '@/i18n/translate';

interface Names {
  months: string[];
  monthsShort: string[];
  /** Monday first (ISO weekday 1 … 7). */
  weekdays: string[];
  weekdaysShort: string[];
}

const NAMES: Record<Exclude<Locale, 'en'>, Names> = {
  hi: {
    months: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
    monthsShort: ['जन॰', 'फ़र॰', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल॰', 'अग॰', 'सित॰', 'अक्टू॰', 'नव॰', 'दिस॰'],
    weekdays: ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार'],
    weekdaysShort: ['सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि', 'रवि'],
  },
  kn: {
    months: ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'],
    monthsShort: ['ಜನ', 'ಫೆಬ್ರ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿ', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗ', 'ಸೆಪ್ಟೆಂ', 'ಅಕ್ಟೋ', 'ನವೆಂ', 'ಡಿಸೆಂ'],
    weekdays: ['ಸೋಮವಾರ', 'ಮಂಗಳವಾರ', 'ಬುಧವಾರ', 'ಗುರುವಾರ', 'ಶುಕ್ರವಾರ', 'ಶನಿವಾರ', 'ಭಾನುವಾರ'],
    weekdaysShort: ['ಸೋಮ', 'ಮಂಗಳ', 'ಬುಧ', 'ಗುರು', 'ಶುಕ್ರ', 'ಶನಿ', 'ಭಾನು'],
  },
};

/** Year, month, day, hour and minute of an instant on the school's clock. */
function partsIn(iso: string, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), time: `${p.hour}:${p.minute}` };
}

const EN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Monday", "सोमवार", "ಸೋಮವಾರ" for an ISO weekday (1 = Monday … 7 = Sunday). */
export function weekdayName(isoDay: number, locale: Locale = 'en'): string {
  return (locale === 'en' ? EN_DAYS : NAMES[locale].weekdays)[isoDay - 1] ?? '';
}

/** "Mon", "सोम", "ಸೋಮ" for an ISO weekday. */
export function weekdayNameShort(isoDay: number, locale: Locale = 'en'): string {
  return locale === 'en' ? (EN_DAYS[isoDay - 1] ?? '').slice(0, 3) : (NAMES[locale].weekdaysShort[isoDay - 1] ?? '');
}

/** Short weekday ("Mon", "सोम", "ಸೋಮ") for a calendar date. */
export function weekdayShort(date: string, locale: Locale = 'en'): string {
  if (locale === 'en') return new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  return NAMES[locale].weekdaysShort[isoWeekday(date) - 1];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today's date in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

export function formatDate(date: string, style: 'long' | 'short' | 'weekday' | 'day' | 'dayMonth' = 'long', locale: Locale = 'en'): string {
  if (locale !== 'en') {
    const n = NAMES[locale];
    const [y, m, day] = date.split('-').map(Number);
    const w = isoWeekday(date) - 1;
    if (style === 'long') return `${n.weekdays[w]}, ${day} ${n.months[m - 1]} ${y}`;
    if (style === 'weekday') return n.weekdays[w];
    if (style === 'day') return `${day} ${n.monthsShort[m - 1]} ${y}`;
    if (style === 'dayMonth') return `${day} ${n.monthsShort[m - 1]}`;
    return `${n.weekdaysShort[w]}, ${day} ${n.monthsShort[m - 1]}`;
  }
  const d = new Date(`${date}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'weekday'
        ? { weekday: 'long' }
        : style === 'day'
          ? { day: 'numeric', month: 'short', year: 'numeric' }
          : style === 'dayMonth'
            ? { day: 'numeric', month: 'short' }
          : { weekday: 'short', day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(BCP47[locale], { ...opts, timeZone: 'UTC' }).format(d);
}

/** "October 2026" for a calendar month (any date in it). */
export function formatMonth(date: string, locale: Locale = 'en'): string {
  if (locale !== 'en') return `${NAMES[locale].months[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
  return new Intl.DateTimeFormat(BCP47[locale], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`));
}

/** "09:00:00" → "09:00". */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : '';
}

/** Days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "3 min ago", "2 h ago", "yesterday", or a date. Pass `t` for the ERP language (English without). */
export function relativeTime(iso: string, now: Date = new Date(), timeZone = 'Asia/Kolkata', t?: TFunction): string {
  const diff = Math.round((now.getTime() - Date.parse(iso)) / 1000);
  const say = (key: Parameters<TFunction>[0], n: number, en: string) => (t ? t(key, { n }) : en);
  if (diff < 0) {
    const ahead = -diff;
    if (ahead < 3600) {
      const n = Math.max(1, Math.round(ahead / 60));
      return say('time.inMin', n, `in ${n} min`);
    }
    if (ahead < 86_400) {
      const n = Math.round(ahead / 3600);
      return say('time.inHours', n, `in ${n} h`);
    }
    const n = Math.round(ahead / 86_400);
    return say('time.inDays', n, `in ${n} days`);
  }
  if (diff < 60) return t ? t('time.justNow') : 'just now';
  if (diff < 3600) {
    const n = Math.round(diff / 60);
    return say('time.minAgo', n, `${n} min ago`);
  }
  if (diff < 86_400) {
    const n = Math.round(diff / 3600);
    return say('time.hoursAgo', n, `${n} h ago`);
  }
  if (diff < 2 * 86_400) return t ? t('time.yesterday') : 'yesterday';
  return formatDateTime(iso, timeZone, false, t?.locale);
}

export function formatDateTime(iso: string, timeZone = 'Asia/Kolkata', withTime = true, locale: Locale = 'en'): string {
  if (locale !== 'en') {
    const p = partsIn(iso, timeZone);
    const day = `${p.d} ${NAMES[locale].monthsShort[p.m - 1]}`;
    return withTime ? `${day}, ${p.time}` : day;
  }
  return new Intl.DateTimeFormat(BCP47[locale], {
    timeZone,
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone = 'Asia/Kolkata', locale: Locale = 'en'): string {
  if (locale !== 'en') return partsIn(iso, timeZone).time;
  return new Intl.DateTimeFormat(BCP47[locale], { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
