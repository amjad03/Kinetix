import { describe, expect, it } from 'vitest';
import { consentShares, DEFAULT_BOARD_KIOSK, grievanceBody, grievanceProblem, kioskPinProblem, needsConfirm, settingDisabled, type InstitutionSettings } from './settings';

const s: InstitutionSettings = { liveViewEnabled: true, liveViewIndicator: true, classroomAudioToViewers: false, pinFallbackEnabled: false };

describe('settings', () => {
  it('greys out the viewing sign and class audio while live view is off', () => {
    expect(settingDisabled(s, 'liveViewIndicator')).toBe(false);
    const off = { ...s, liveViewEnabled: false };
    expect(settingDisabled(off, 'liveViewIndicator')).toBe(true);
    expect(settingDisabled(off, 'classroomAudioToViewers')).toBe(true);
    expect(settingDisabled(off, 'liveViewEnabled')).toBe(false);
    expect(settingDisabled(off, 'pinFallbackEnabled')).toBe(false);
  });

  it('asks before letting leaders hear classes, not before turning it off', () => {
    expect(needsConfirm('classroomAudioToViewers', true)).toBe(true);
    expect(needsConfirm('classroomAudioToViewers', false)).toBe(false);
    expect(needsConfirm('liveViewEnabled', true)).toBe(false);
  });

  it('splits students into shares that add up to 100', () => {
    expect(consentShares({ granted: 2, withdrawn: 0, notAsked: 18 })).toEqual({ granted: 10, withdrawn: 0, notAsked: 90 });
    expect(consentShares({ granted: 1, withdrawn: 1, notAsked: 1 })).toEqual({ granted: 34, withdrawn: 33, notAsked: 33 });
    const r = consentShares({ granted: 1, withdrawn: 2, notAsked: 4 })!;
    expect(r.granted + r.withdrawn + r.notAsked).toBe(100);
    expect(consentShares({ granted: 0, withdrawn: 0, notAsked: 0 })).toBeNull();
  });

  it('checks the grievance officer like the API and drops empty contact fields', () => {
    const ok = { name: ' Dr. Kavya Rao ', email: '', phone: '' };
    expect(grievanceProblem(ok)).toBeNull();
    expect(grievanceBody(ok)).toEqual({ name: 'Dr. Kavya Rao' });
    expect(grievanceBody({ name: 'K', email: ' grievance@demo.in ', phone: '+91 80 1234 5678' })).toEqual({ name: 'K', email: 'grievance@demo.in', phone: '+91 80 1234 5678' });
    expect(grievanceProblem({ ...ok, name: '  ' })).toBe('name');
    expect(grievanceProblem({ ...ok, name: 'x'.repeat(121) })).toBe('nameLong');
    expect(grievanceProblem({ ...ok, email: 'not-an-email' })).toBe('email');
    expect(grievanceProblem({ ...ok, phone: '1'.repeat(21) })).toBe('phone');
  });
});

describe('board kiosk IT PIN', () => {
  it('takes 4 to 8 digits, typed the same twice', () => {
    expect(kioskPinProblem('1234', '1234')).toBeNull();
    expect(kioskPinProblem('48291537', '48291537')).toBeNull();
    expect(kioskPinProblem('123', '123')).toBe('length');
    expect(kioskPinProblem('123456789', '123456789')).toBe('length');
    expect(kioskPinProblem('', '')).toBe('length');
    expect(kioskPinProblem('12a4', '12a4')).toBe('digits');
    expect(kioskPinProblem('12 34', '12 34')).toBe('digits');
    expect(kioskPinProblem('١٢٣٤', '١٢٣٤')).toBe('digits');
    expect(kioskPinProblem('1234', '1243')).toBe('mismatch');
  });

  it('is on, without a PIN, until the institution changes it', () => {
    expect(DEFAULT_BOARD_KIOSK).toEqual({ enabled: true, pinSet: false, pinSetAt: null });
  });
});
