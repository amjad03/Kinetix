import { describe, expect, it } from 'vitest';
import { acceptFor, formatBytes, LAUNCHER_PRESETS, launcherProblem, rolloutProgress, stateTone, uploadType, versionOk } from './panel';

describe('panel home list', () => {
  it('accepts the presets', () => {
    expect(launcherProblem(LAUNCHER_PRESETS)).toBeNull();
  });

  it('names what is wrong', () => {
    expect(launcherProblem([{ package: 'chrome', label: 'Chrome', iconUrl: null }])).toBe('zx.p.err.package');
    expect(launcherProblem([{ package: 'com.android.chrome', label: ' ', iconUrl: null }])).toBe('zx.p.err.label');
    expect(launcherProblem([{ package: 'com.android.chrome', label: 'Chrome', iconUrl: 'ftp://x' }])).toBe('zx.p.err.icon');
    expect(launcherProblem([LAUNCHER_PRESETS[0], LAUNCHER_PRESETS[0]])).toBe('zx.p.err.duplicate');
    expect(launcherProblem(Array.from({ length: 41 }, (_, i) => ({ package: `com.x.app${i}`, label: 'X', iconUrl: null })))).toBe('zx.p.err.tooMany');
  });
});

describe('releases', () => {
  it('checks versions as the API does', () => {
    for (const v of ['1.4.0', '1.4.0+12', 'v2', '1.2.0-beta.1']) expect(versionOk(v), v).toBe(true);
    for (const v of ['', 'one', '1.4.0 final']) expect(versionOk(v), v).toBe(false);
  });

  it('types uploads by their extension', () => {
    expect(uploadType({ name: 'Zynetix.APK', type: '' })).toBe('application/vnd.android.package-archive');
    expect(uploadType({ name: 'board.zip', type: '' })).toBe('application/zip');
    expect(uploadType({ name: 'notes.bin', type: '' })).toBe('application/octet-stream');
    expect(acceptFor('android')).toContain('.apk');
    expect(acceptFor('windows')).toContain('.zip');
  });

  it('sums a rollout', () => {
    const b = (state: 'installed' | 'failed' | 'pending') => ({ deviceId: state, name: state, appVersion: null, lastSeenAt: null, state, error: null, updatedAt: null });
    expect(rolloutProgress({ boards: [b('installed'), b('failed'), b('pending'), b('installed')] })).toEqual({ installed: 2, total: 4, failed: 1, percent: 50 });
    expect(rolloutProgress({ boards: [] }).percent).toBe(0);
    expect(stateTone('failed')).toBe('danger');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
