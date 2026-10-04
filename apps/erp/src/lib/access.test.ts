import { describe, expect, it } from 'vitest';
import { canEditCalendar, canLinkSubjects, canPublishMarks, canSee, canUseErp, homeFor, isOnlyHod, landingFor, sectionOf } from './access';

describe('access', () => {
  it('lets the accounts office into Fees (and the calendar) only', () => {
    const r = ['accountant'];
    expect(canUseErp(r)).toBe(true);
    expect(canSee(r, 'fees')).toBe(true);
    for (const s of ['school', 'boards', 'live', 'syllabus', 'ai', 'library', 'results', 'timetable', 'conversations'] as const) expect(canSee(r, s)).toBe(false);
    expect(homeFor(r)).toBe('/fees');
    expect(landingFor(r, '/')).toBe('/fees');
    expect(landingFor(r, '/fees/invoices?status=due')).toBe('/fees/invoices?status=due');
  });

  it('lets the librarian into Library (and the calendar) only', () => {
    const r = ['librarian'];
    expect(canUseErp(r)).toBe(true);
    expect(canSee(r, 'library')).toBe(true);
    for (const s of ['school', 'boards', 'live', 'fees', 'syllabus', 'ai', 'results', 'timetable', 'conversations'] as const) expect(canSee(r, s)).toBe(false);
    expect(homeFor(r)).toBe('/library');
    expect(landingFor(r, '/')).toBe('/library');
    expect(landingFor(r, '/timetable')).toBe('/library');
    expect(landingFor(r, '/library?tab=loans')).toBe('/library?tab=loans');
  });

  it('gives the principal and admin the library, results and the timetable editor', () => {
    for (const r of [['principal'], ['tenant_admin']]) {
      for (const s of ['library', 'results', 'timetable', 'conversations', 'import'] as const) expect(canSee(r, s)).toBe(true);
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
    expect(canSee(r, 'import')).toBe(false);
    expect(sectionOf('/import')).toBe('import');
    expect(landingFor(r, '/import')).toBe(homeFor(r));
    expect(canLinkSubjects(r)).toBe(false);
    expect(canSee(r, 'results')).toBe(true);
    expect(canPublishMarks(r)).toBe(false);
    expect(canSee(r, 'library')).toBe(false);
    expect(canSee(r, 'timetable')).toBe(false);
    expect(canSee(r, 'conversations')).toBe(false);
    expect(landingFor(r, '/fees')).toBe('/department');
    expect(landingFor(r, '/conversations/abc')).toBe('/department');
  });

  it('lands a head of department on Department, and keeps Today for a principal who is also HOD', () => {
    const hod = ['teacher', 'hod'];
    expect(isOnlyHod(hod)).toBe(true);
    expect(homeFor(hod)).toBe('/department');
    expect(landingFor(hod, '')).toBe('/department');
    expect(landingFor(hod, '/')).toBe('/');
    expect(canSee(hod, 'school')).toBe(true);
    expect(canSee(hod, 'department')).toBe(true);
    expect(canSee(hod, 'departments')).toBe(false);
    expect(landingFor(hod, '/departments')).toBe('/department');
    for (const r of [['principal', 'hod'], ['tenant_admin'], ['principal']]) {
      expect(isOnlyHod(r)).toBe(false);
      expect(homeFor(r)).toBe('/');
      expect(canSee(r, 'department')).toBe(true);
      expect(canSee(r, 'departments')).toBe(true);
    }
    for (const r of [['accountant'], ['librarian'], ['teacher']]) {
      expect(canSee(r, 'department')).toBe(false);
      expect(canSee(r, 'departments')).toBe(false);
    }
    expect(sectionOf('/department')).toBe('department');
    expect(sectionOf('/departments')).toBe('departments');
  });

  it('shows everyone in the ERP the calendar, and lets only the principal and admin keep it and the settings', () => {
    for (const r of [['principal'], ['tenant_admin'], ['teacher', 'hod'], ['accountant'], ['librarian']]) expect(canSee(r, 'calendar')).toBe(true);
    expect(canSee(['teacher'], 'calendar')).toBe(false);
    for (const r of [['principal'], ['tenant_admin']]) {
      expect(canEditCalendar(r)).toBe(true);
      expect(canSee(r, 'settings')).toBe(true);
    }
    for (const r of [['teacher', 'hod'], ['accountant'], ['librarian']]) {
      expect(canEditCalendar(r)).toBe(false);
      expect(canSee(r, 'settings')).toBe(false);
    }
    expect(sectionOf('/calendar')).toBe('calendar');
    expect(sectionOf('/settings')).toBe('settings');
    expect(landingFor(['accountant'], '/calendar?month=2026-11')).toBe('/calendar?month=2026-11');
    expect(landingFor(['teacher', 'hod'], '/settings')).toBe('/department');
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
    expect(sectionOf('/conversations/abc')).toBe('conversations');
    expect(sectionOf('/elsewhere')).toBeNull();
    expect(landingFor(['principal'], '//evil.example')).toBe('/');
    expect(landingFor(['principal'], 'https://evil.example')).toBe('/');
  });
});
