import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';
import { applySchoolWording } from './school-wording';

describe('school wording', () => {
  it('says Class / Term / Subject for a school, in every language', () => {
    const en = applySchoolWording(MESSAGES.en, 'en');
    expect(en['exm.sessionSubtitle']).toBe('Class {term}');
    expect(Object.values(en).some((v) => typeof v === 'string' && /\b(Semester|Programme)\b/.test(v))).toBe(false);
    expect(applySchoolWording(MESSAGES.hi, 'hi')['exm.f.term']).toBe('कक्षा');
    expect(Object.values(applySchoolWording(MESSAGES.kn, 'kn')).join(' ')).not.toContain('ಸೆಮಿಸ್ಟರ್');
  });
});
