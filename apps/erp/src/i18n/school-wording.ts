import type { Locale } from './locales';
import type { Messages } from './messages';

/**
 * School wording: a school tenant (academic model "school") says Class / Section / Term / Subject where a college
 * says Programme / Semester / Course. Applied to the whole dictionary before the institution's own wording, so
 * every page picks it up without per-page checks. Exam and roster fields whose number is the class (a school's
 * "term" column holds the grade) say Class.
 */
const WORDS: Record<Locale, [RegExp, string][]> = {
  en: [
    [/\bProgrammes\b/g, 'Classes'],
    [/\bprogrammes\b/g, 'classes'],
    [/\bProgramme\b/g, 'Class'],
    [/\bprogramme\b/g, 'class'],
    [/\bSemesters\b/g, 'Terms'],
    [/\bsemesters\b/g, 'terms'],
    [/\bSemester\b/g, 'Term'],
    [/\bsemester\b/g, 'term'],
    [/\bCourses\b/g, 'Subjects'],
    [/\bcourses\b/g, 'subjects'],
    [/\bCourse\b/g, 'Subject'],
    [/(?<!of )\bcourse\b/g, 'subject'],
  ],
  hi: [
    [/प्रोग्राम/g, 'कक्षा'],
    [/सेमेस्टर/g, 'सत्र'],
    [/कोर्स/g, 'विषय'],
  ],
  kn: [
    [/ಪ್ರೋಗ್ರಾಂ/g, 'ತರಗತಿ'],
    [/ಸೆಮಿಸ್ಟರ್/g, 'ಅವಧಿ'],
    [/ಕೋರ್ಸ್/g, 'ವಿಷಯ'],
  ],
};

const CLASS_KEYS: Record<Locale, Record<string, string>> = {
  en: { 'exm.sessionSubtitle': 'Class {term}', 'exm.f.term': 'Class', 'xo.c.term': 'Class', 'ro.f.semester': 'Class' },
  hi: { 'exm.sessionSubtitle': 'कक्षा {term}', 'exm.f.term': 'कक्षा', 'xo.c.term': 'कक्षा', 'ro.f.semester': 'कक्षा' },
  kn: { 'exm.sessionSubtitle': 'ತರಗತಿ {term}', 'exm.f.term': 'ತರಗತಿ', 'xo.c.term': 'ತರಗತಿ', 'ro.f.semester': 'ತರಗತಿ' },
};

export function isSchoolModel(model: string | null | undefined): boolean {
  return model === 'school';
}

export function applySchoolWording(messages: Messages, locale: Locale): Messages {
  const out: Record<string, string> = {};
  const rules = WORDS[locale];
  for (const [k, v] of Object.entries(messages)) {
    if (typeof v !== 'string') {
      out[k] = v as never;
      continue;
    }
    let s = v;
    for (const [re, to] of rules) s = s.replace(re, to);
    out[k] = s;
  }
  Object.assign(out, CLASS_KEYS[locale]);
  return out as Messages;
}
