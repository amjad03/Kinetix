import { describe, expect, it } from 'vitest';
import { canSee, canUseErp } from './access';
import { visibleGroups } from './nav';
import { delegationState, openRequests, waitingDays, type DpdpRow } from './dpdp';

const row = (id: string, status: DpdpRow['status'], createdAt: string): DpdpRow => ({ id, userId: 'u', kind: 'erasure', status, details: '', correction: null, resolutionNote: null, retentionReasons: [], processedAt: null, createdAt, person: null });

describe('data privacy queue', () => {
  it('lists open requests oldest first and counts waiting days', () => {
    const rows = [row('b', 'pending', '2026-10-05T00:00:00Z'), row('a', 'pending', '2026-10-01T00:00:00Z'), row('c', 'completed', '2026-09-01T00:00:00Z')];
    expect(openRequests(rows).map((r) => r.id)).toEqual(['a', 'b']);
    expect(waitingDays('2026-10-01T00:00:00Z', new Date('2026-10-11T12:00:00Z'))).toBe(10);
    expect(waitingDays('2026-10-20T00:00:00Z', new Date('2026-10-11T12:00:00Z'))).toBe(0);
  });
});

describe('delegation state', () => {
  const d = { startsOn: '2026-10-10', endsOn: '2026-10-20', revokedAt: null };
  it('follows the dates and revocation', () => {
    expect(delegationState(d, '2026-10-09')).toBe('upcoming');
    expect(delegationState(d, '2026-10-10')).toBe('active');
    expect(delegationState(d, '2026-10-20')).toBe('active');
    expect(delegationState(d, '2026-10-21')).toBe('ended');
    expect(delegationState({ ...d, revokedAt: '2026-10-12T00:00:00Z' }, '2026-10-15')).toBe('revoked');
  });
});

describe('access for the new roles', () => {
  it('gives the exam controller the exam cell but not OBE or the privacy queue', () => {
    expect(canSee(['exam_controller'], 'evaluation')).toBe(true);
    expect(canSee(['exam_controller'], 'exams')).toBe(true);
    expect(canSee(['exam_controller'], 'obe')).toBe(false);
    expect(canSee(['exam_controller'], 'dpdp')).toBe(false);
  });
  it('gives the examiner only the evaluation desk (and tasks)', () => {
    expect(canSee(['examiner'], 'evaluationDesk')).toBe(true);
    expect(canSee(['examiner'], 'evaluation')).toBe(false);
    expect(canSee(['examiner'], 'finance')).toBe(false);
  });
  it('gives the quality officer OBE, surveys, academic audit and course files', () => {
    for (const s of ['obe', 'surveys', 'academicAudit', 'courseFiles'] as const) expect(canSee(['quality_officer'], s), s).toBe(true);
    expect(canSee(['quality_officer'], 'evaluation')).toBe(false);
    expect(canSee(['quality_officer'], 'fees')).toBe(false);
  });
  it('keeps alumni out of the ERP (they use the alumni portal) and the privacy queue to administrators', () => {
    expect(canUseErp(['alumni'])).toBe(false);
    expect(canSee(['principal'], 'dpdp')).toBe(true);
    expect(canSee(['hod'], 'dpdp')).toBe(false);
  });
  it('shows delegations to staff roles and puts both new pages in the menu', () => {
    expect(canSee(['hod'], 'delegations')).toBe(true);
    expect(canSee(['student'], 'delegations')).toBe(false);
    const hrefs = (roles: string[]) => visibleGroups(roles).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs(['principal'])).toEqual(expect.arrayContaining(['/delegations', '/dpdp']));
    expect(hrefs(['quality_officer'])).toContain('/delegations');
    expect(hrefs(['quality_officer'])).not.toContain('/dpdp');
  });
});
