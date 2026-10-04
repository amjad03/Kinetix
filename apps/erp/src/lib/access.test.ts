import { describe, expect, it } from 'vitest';
import { canLinkSubjects, canPublishMarks, canSee, canUseErp, homeFor, landingFor, sectionOf } from './access';

describe('access', () => {
  it('lets the accounts office into Fees only', () => {
    const r = ['accountant'];
    expect(canUseErp(r)).toBe(true);
    expect(canSee(r, 'fees')).toBe(true);
    for (const s of ['school', 'boards', 'live', 'syllabus', 'ai', 'library', 'results', 'timetable'] as const) expect(canSee(r, s)).toBe(false);
    expect(homeFor(r)).toBe('/fees');
    expect(landingFor(r, '/')).toBe('/fees');
    expect(landingFor(r, '/fees/invoices?status=due')).toBe('/fees/invoices?status=due');
  });

  it('lets the librarian into Library only', () => {
    const r = ['librarian'];
    expect(canUseErp(r)).toBe(true);
    expect(canSee(r, 'library')).toBe(true);
    for (const s of ['school', 'boards', 'live', 'fees', 'syllabus', 'ai', 'results', 'timetable'] as const) expect(canSee(r, s)).toBe(false);
    expect(homeFor(r)).toBe('/library');
    expect(landingFor(r, '/')).toBe('/library');
    expect(landingFor(r, '/timetable')).toBe('/library');
    expect(landingFor(r, '/library?tab=loans')).toBe('/library?tab=loans');
  });

  it('gives the principal and admin the library, results and the timetable editor', () => {
    for (const r of [['principal'], ['tenant_admin']]) {
      for (const s of ['library', 'results', 'timetable'] as const) expect(canSee(r, s)).toBe(true);
      expect(canPublishMarks(r)).toBe(true);
      expect(homeFor(r)).toBe('/');
    }
  });

  it('keeps heads of department out of Fees and AI usage', () => {
    const r = ['teacher', 'hod'];
    expect(canSee(r, 'live')).toBe(true);
    expect(canSee(r, 'syllabus')).toBe(true);
    expect(canSee(r, 'fees')).toBe(false);
    expect(canSee(r, 'ai')).toBe(false);
    expect(canLinkSubjects(r)).toBe(false);
    expect(canSee(r, 'results')).toBe(true);
    expect(canPublishMarks(r)).toBe(false);
    expect(canSee(r, 'library')).toBe(false);
    expect(canSee(r, 'timetable')).toBe(false);
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
    expect(sectionOf('/results/abc')).toBe('results');
    expect(sectionOf('/timetable')).toBe('timetable');
    expect(sectionOf('/library')).toBe('library');
    expect(sectionOf('/elsewhere')).toBeNull();
    expect(landingFor(['principal'], '//evil.example')).toBe('/');
    expect(landingFor(['principal'], 'https://evil.example')).toBe('/');
  });
});
