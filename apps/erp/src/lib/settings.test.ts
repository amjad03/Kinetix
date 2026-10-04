import { describe, expect, it } from 'vitest';
import { consentShares, needsConfirm, settingDisabled, type InstitutionSettings } from './settings';

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
});
