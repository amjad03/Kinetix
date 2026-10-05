import { describe, expect, it } from 'vitest';
import { ERROR_KEYS, errorText } from './errors';
import { createFormat } from './format';
import { fromAcceptLanguage, isLocale, LOCALES } from './locales';
import { AREAS, MESSAGES, type MessageKey } from './messages';
import { createT } from './translate';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const en = MESSAGES.en;
const keys = Object.keys(en) as MessageKey[];
/**
 * Words that stay in Latin script in every language (glossary): brand and technical names, and
 * values people type into import files as they are (CSV, levels ug/pg/school, languages en/hi/kn, days Mon–Sun).
 */
const LATIN_OK = /^(KINETIX|ERP|AI|UPI|ISBN|ID|PIN|HOD|UTR|PC|Windows|Board|Teacher|App|Parent|Student|Books|Set|up|this|board|Register|Commerce|Room|demo-college|Cr|L|Cloud|CSV|UTF-|ug|pg|school|en|hi|kn|Mon|Sun|Razorpay|KYC|API|URL)$/;

describe('dictionary', () => {
  it('has every key in English, Hindi and Kannada, and nothing extra', () => {
    for (const locale of LOCALES) {
      const have = Object.keys(MESSAGES[locale]).sort();
      expect(have, locale).toEqual([...keys].sort());
      for (const k of keys) expect(MESSAGES[locale][k].trim(), `${locale} ${k}`).not.toBe('');
    }
  });

  it('defines each key in one area only', () => {
    const seen = new Map<string, string>();
    for (const [name, a] of Object.entries(AREAS)) {
      for (const k of Object.keys(a.en)) {
        expect(seen.get(k), `${k} is in ${seen.get(k)} and ${name}`).toBeUndefined();
        seen.set(k, name);
      }
      for (const locale of ['hi', 'kn'] as const) expect(Object.keys(a[locale]).sort(), `${name} ${locale}`).toEqual(Object.keys(a.en).sort());
    }
  });

  it('keeps the same placeholders in every language', () => {
    for (const k of keys) for (const locale of ['hi', 'kn'] as const) expect(placeholders(MESSAGES[locale][k]), `${locale} ${k}`).toEqual(placeholders(en[k]));
  });

  it('gives every plural both forms', () => {
    for (const k of keys) {
      if (k.endsWith('_one')) expect(keys, k).toContain(k.replace(/_one$/, '_other'));
      if (k.endsWith('_other')) expect(keys, k).toContain(k.replace(/_other$/, '_one'));
    }
  });

  it('translates every string (only brand and technical words stay in Latin script)', () => {
    for (const locale of ['hi', 'kn'] as const) {
      for (const k of keys) {
        const latin = MESSAGES[locale][k].replace(/\{\w+\}/g, '').match(/[A-Za-z][A-Za-z-]*/g) ?? [];
        const stray = latin.filter((w) => !LATIN_OK.test(w));
        expect(stray, `${locale} ${k}: ${MESSAGES[locale][k]}`).toEqual([]);
      }
    }
  });

  it('has a translation for every API error code the ERP words itself', () => {
    for (const key of Object.values(ERROR_KEYS)) expect(keys).toContain(key);
  });
});

describe('t()', () => {
  it('fills placeholders with Indian number grouping and Western digits', () => {
    expect(createT('en', MESSAGES.en)('common.of', { a: 1234567, b: 'x' })).toBe('12,34,567 of x');
    expect(createT('kn', MESSAGES.kn)('dept.of', { n: 1234567, d: 2 })).toBe('2 ರಲ್ಲಿ 12,34,567');
    expect(createT('hi', MESSAGES.hi)('att.absent', { n: 3 })).toBe('3 अनुपस्थित');
  });

  it('picks plural forms by the language', () => {
    const t = createT('en', MESSAGES.en);
    expect(t.plural('time.daysAgo', 1)).toBe('1 day ago');
    expect(t.plural('time.daysAgo', 3)).toBe('3 days ago');
    const kn = createT('kn', MESSAGES.kn);
    expect(kn.plural('cal.days', 1)).toBe('1 ದಿನ');
    expect(kn.plural('cal.days', 3)).toBe('3 ದಿನಗಳು');
  });

  it('words API errors by code, and keeps the English detail where it has none', () => {
    const hi = createT('hi', MESSAGES.hi);
    expect(errorText({ code: 'CALENDAR_BAD_RANGE', message: 'The last day must be on or after the first day', status: 400 }, hi)).toBe(MESSAGES.hi['error.CALENDAR_BAD_RANGE']);
    expect(errorText({ code: 'VALIDATION', message: 'Expected string', status: 400 }, hi)).toBe(`${MESSAGES.hi['error.VALIDATION']} (Expected string)`);
    expect(errorText({ code: 'BAD_REQUEST', message: 'That book is already lent', status: 400 }, createT('en', MESSAGES.en))).toBe('That book is already lent');
  });
});

describe('formats', () => {
  it('formats dates in each language with Western digits', () => {
    const f = (l: 'en' | 'hi' | 'kn') => createFormat(l, createT(l, MESSAGES[l]));
    expect(f('en').date('2026-10-02', 'long')).toBe('Friday, 2 October 2026');
    expect(f('hi').date('2026-10-02', 'long')).toBe('शुक्रवार, 2 अक्टूबर 2026');
    expect(f('kn').date('2026-10-02', 'long')).toBe('ಶುಕ್ರವಾರ, 2 ಅಕ್ಟೋಬರ್ 2026');
    expect(f('hi').date('2026-10-02', 'short')).toBe('शुक्र, 2 अक्टू॰');
    expect(f('kn').month('2026-11-15')).toBe('ನವೆಂಬರ್ 2026');
    expect(f('hi').time('2026-10-02T04:30:00Z')).toBe('10:00');
    expect(f('kn').dateTime('2026-10-02T04:30:00Z')).toBe('2 ಅಕ್ಟೋ, 10:00');
  });

  it('says relative days and big rupee totals in the language', () => {
    const hi = createFormat('hi', createT('hi', MESSAGES.hi));
    expect(hi.relativeDay('2026-10-01', '2026-10-04')).toBe('3 दिन पहले');
    expect(hi.rupeesShort(925_000_00)).toBe('₹9.25 लाख');
    const kn = createFormat('kn', createT('kn', MESSAGES.kn));
    expect(kn.relativeDay('2026-10-05', '2026-10-04')).toBe('ನಾಳೆ');
    expect(kn.number(1234567)).toBe('12,34,567');
    expect(kn.rupees(123456700)).toBe('₹12,34,567');
  });
});

describe('locales', () => {
  it('reads hi / kn from Accept-Language, else nothing', () => {
    expect(fromAcceptLanguage('kn-IN,kn;q=0.9,en;q=0.8')).toBe('kn');
    expect(fromAcceptLanguage('hi')).toBe('hi');
    expect(fromAcceptLanguage('ta-IN,fr')).toBeNull();
    expect(fromAcceptLanguage(undefined)).toBeNull();
    expect(isLocale('kn')).toBe(true);
    expect(isLocale('ta')).toBe(false);
  });
});
