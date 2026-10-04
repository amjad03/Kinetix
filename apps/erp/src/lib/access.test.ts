import { describe, expect, it } from 'vitest';
import { canLinkSubjects, canSee, canUseErp, homeFor, landingFor, sectionOf } from './access';

describe('access', () => {
  it('lets the accounts office into Fees only', () => {
    const r = ['accountant'];
    expect(canUseErp(r)).toBe(true);
    expect(canSee(r, 'fees')).toBe(true);
    for (const s of ['school', 'boards', 'live', 'syllabus', 'ai'] as const) expect(canSee(r, s)).toBe(false);
    expect(homeFor(r)).toBe('/fees');
    expect(landingFor(r, '/')).toBe('/fees');
    expect(landingFor(r, '/fees/invoices?status=due')).toBe('/fees/invoices?status=due');
  });

  it('keeps heads of department out of Fees and AI usage', () => {
    const r = ['teacher', 'hod'];
    expect(canSee(r, 'live')).toBe(true);
    expect(canSee(r, 'syllabus')).toBe(true);
    expect(canSee(r, 'fees')).toBe(false);
    expect(canSee(r, 'ai')).toBe(false);
    expect(canLinkSubjects(r)).toBe(false);
    expect(landingFor(r, '/fees')).toBe('/');
  });

  it('refuses teachers, students and parents', () => {
    expect(canUseErp(['teacher'])).toBe(false);
    expect(canUseErp(['guardian'])).toBe(false);
    expect(canUseErp(['principal'])).toBe(true);
  });

  it('maps paths to sections and ignores unsafe next paths', () => {
    expect(sectionOf('/')).toBe('school');
    expect(sectionOf('/live/abc')).toBe('live');
    expect(sectionOf('/fees/receipts/1')).toBe('fees');
    expect(sectionOf('/elsewhere')).toBeNull();
    expect(landingFor(['principal'], '//evil.example')).toBe('/');
    expect(landingFor(['principal'], 'https://evil.example')).toBe('/');
  });
});
