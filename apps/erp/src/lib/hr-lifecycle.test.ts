import { describe, expect, it } from 'vitest';
import { canSee, sectionOf } from './access';
import { NAV_GROUPS, visibleGroups } from './nav';

const hrefs = (roles: string[]) => visibleGroups(roles as never, false).flatMap((g) => g.items.map((i) => i.href));

describe('HR lifecycle access', () => {
  it('opens appraisal and training to heads of department, HR and the principal only', () => {
    expect(sectionOf('/hr/appraisal')).toBe('appraisal');
    expect(sectionOf('/hr/training')).toBe('appraisal');
    expect(sectionOf('/hr/exit')).toBe('hr');
    expect(sectionOf('/hr/onboarding')).toBe('hr');
    expect(canSee(['hod'], 'appraisal')).toBe(true);
    expect(canSee(['hod'], 'hr')).toBe(false);
    expect(canSee(['hr_manager'], 'appraisal')).toBe(true);
    expect(canSee(['teacher'], 'appraisal')).toBe(false);
    expect(canSee(['accountant'], 'appraisal')).toBe(false);
  });

  it('shows the appraisal page in the HR group for those roles', () => {
    expect(hrefs(['hod'])).toContain('/hr/appraisal');
    expect(hrefs(['hod'])).not.toContain('/hr');
    expect(hrefs(['hr_manager'])).toContain('/hr/appraisal');
    expect(hrefs(['accountant'])).not.toContain('/hr/appraisal');
    expect(NAV_GROUPS.find((g) => g.id === 'hr')!.items.map((i) => i.section)).toContain('appraisal');
  });
});
