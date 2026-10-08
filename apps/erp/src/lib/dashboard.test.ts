import { describe, expect, it } from 'vitest';
import { greetingName, percentChange, personaFor, pointsChange, viewFrom, viewsFor } from './dashboard';

describe('personaFor', () => {
  it('gives the most senior role its dashboard', () => {
    expect(personaFor(['teacher', 'principal'])).toBe('principal');
    expect(personaFor(['tenant_admin'])).toBe('principal');
    expect(personaFor(['teacher', 'hod'])).toBe('hod');
    expect(personaFor(['accountant'])).toBe('accountant');
    expect(personaFor(['admissions_officer'])).toBe('admissions');
    expect(personaFor(['hr_manager'])).toBe('hr');
    expect(personaFor(['librarian'])).toBeNull();
  });
});

describe('views', () => {
  it('lets the principal switch between every desk and others see only their own', () => {
    expect(viewsFor(['principal'])).toEqual(['overview', 'exams', 'finance', 'admissions', 'hr']);
    expect(viewsFor(['hod'])).toEqual(['overview', 'exams']);
    expect(viewsFor(['accountant'])).toEqual(['overview']);
  });
  it('falls back to the overview for a view the role may not open', () => {
    expect(viewFrom('finance', ['hod'])).toBe('overview');
    expect(viewFrom('exams', ['principal'])).toBe('exams');
    expect(viewFrom(undefined, ['principal'])).toBe('overview');
  });
});

describe('trend maths', () => {
  it('computes a percentage change and skips an empty baseline', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(90, 120)).toBe(-25);
    expect(percentChange(5, 0)).toBeNull();
  });
  it('computes points and tolerates missing values', () => {
    expect(pointsChange(92.4, 90.15)).toBe(2.3);
    expect(pointsChange(null, 90)).toBeNull();
  });
  it('greets by first name, keeping a title', () => {
    expect(greetingName('Dr. Priya Sharma')).toBe('Dr. Priya');
    expect(greetingName('Anita Sharma')).toBe('Anita');
    expect(greetingName('Ravi')).toBe('Ravi');
  });
});
