import { describe, expect, it } from 'vitest';
import { canSee, homeFor, landingFor, sectionOf } from './access';
import { lakhs, slaState } from './campus-life';

describe('campus life desks', () => {
  it('gives each desk to its own role, and the committee desk only to the committee', () => {
    expect(canSee(['placement_officer'], 'placements')).toBe(true);
    expect(canSee(['placement_officer'], 'research')).toBe(false);
    expect(canSee(['research_coordinator'], 'research')).toBe(true);
    expect(canSee(['grievance_officer'], 'grievances')).toBe(true);
    expect(canSee(['icc_member'], 'grievances')).toBe(true);
    expect(canSee(['counsellor'], 'grievances')).toBe(false);
    expect(canSee(['hod'], 'placements')).toBe(true);
    expect(canSee(['accountant'], 'grievances')).toBe(false);
  });
  it('lands each role on its desk', () => {
    expect(homeFor(['placement_officer'])).toBe('/placements');
    expect(homeFor(['research_coordinator'])).toBe('/research');
    expect(homeFor(['grievance_officer'])).toBe('/grievances');
    expect(landingFor(['placement_officer'], '/research')).toBe('/placements');
    expect(sectionOf('/placements')).toBe('placements');
    expect(sectionOf('/research/projects')).toBe('research');
    expect(sectionOf('/grievances')).toBe('grievances');
  });
});

describe('ticket deadlines and packages', () => {
  const now = new Date('2026-10-20T04:30:00Z');
  it('classifies a ticket against its SLA', () => {
    expect(slaState({ status: 'open', slaDueAt: '2026-10-19T04:30:00Z' }, now)).toBe('overdue');
    expect(slaState({ status: 'assigned', slaDueAt: '2026-10-20T20:00:00Z' }, now)).toBe('soon');
    expect(slaState({ status: 'in_progress', slaDueAt: '2026-10-30T00:00:00Z' }, now)).toBe('ok');
    expect(slaState({ status: 'resolved', slaDueAt: '2026-10-01T00:00:00Z' }, now)).toBe('done');
  });
  it('formats packages', () => {
    expect(lakhs(7.2)).toBe('7.2');
    expect(lakhs(6)).toBe('6');
    expect(lakhs(null)).toBe('-');
  });
});
