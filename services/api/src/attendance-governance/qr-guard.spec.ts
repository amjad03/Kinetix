import { describe, expect, it } from 'vitest';
import { QR_DEFAULTS } from '../academics/academics-rules.js';
import { deviceHashOf, minutesBetween, qrVerdict, type QrScanFacts } from './qr-guard.js';

const fence = { ...QR_DEFAULTS, requireLocation: true, lat: 12.9716, lng: 77.5946, radiusM: 200, maxAccuracyM: 100, lateMinutes: 15 };
const base: QrScanFacts = { minutesIn: 5, periodMinutes: 55, deviceHash: 'p1', boundDevice: 'p1', deviceBoundToOther: false, deviceUsedInSlot: false, location: { lat: 12.9716, lng: 77.5946, accuracyM: 20 } };

describe('QR anti-proxy verdict', () => {
  it('accepts the bound phone on campus, early in the period', () => {
    expect(qrVerdict(fence, base)).toEqual({ outcome: 'accepted', reasons: [], distanceM: 0, bind: false });
  });

  it('binds the first phone a student uses, unless another student holds it', () => {
    expect(qrVerdict(fence, { ...base, boundDevice: null }).bind).toBe(true);
    const taken = qrVerdict(fence, { ...base, boundDevice: null, deviceBoundToOther: true });
    expect(taken).toMatchObject({ outcome: 'refused', reasons: ['device_bound_to_another'], bind: false });
  });

  it('refuses one phone marking two students in a period, and scans after the period', () => {
    expect(qrVerdict(fence, { ...base, deviceUsedInSlot: true }).outcome).toBe('refused');
    // 55-minute period plus 5 minutes' grace: minute 60 is fine, minute 61 is over.
    expect(qrVerdict(fence, { ...base, minutesIn: 60 }).reasons).toEqual(['late_scan']);
    expect(qrVerdict(fence, { ...base, minutesIn: 61 }).outcome).toBe('refused');
  });

  it('holds another phone, no phone id, late scans, and location problems', () => {
    expect(qrVerdict(fence, { ...base, deviceHash: 'p2' }).reasons).toEqual(['new_device']);
    expect(qrVerdict(fence, { ...base, deviceHash: null }).reasons).toEqual(['no_device']);
    expect(qrVerdict(fence, { ...base, minutesIn: 16 }).reasons).toEqual(['late_scan']);
    expect(qrVerdict(fence, { ...base, minutesIn: 15 }).outcome).toBe('accepted');
    expect(qrVerdict(fence, { ...base, location: null }).reasons).toEqual(['no_location']);
    expect(qrVerdict(fence, { ...base, location: { ...base.location!, accuracyM: 101 } }).reasons).toEqual(['poor_accuracy']);
    expect(qrVerdict(fence, { ...base, location: { ...base.location!, mocked: true } }).reasons).toEqual(['mock_location']);
    // 0.002 degrees of latitude is about 222 m: outside a 200 m fence; 0.0017 (189 m) is inside.
    const out = qrVerdict(fence, { ...base, location: { lat: 12.9736, lng: 77.5946, accuracyM: 10 } });
    expect(out).toMatchObject({ outcome: 'flagged', reasons: ['outside_campus'] });
    expect(out.distanceM).toBe(222);
    expect(qrVerdict(fence, { ...base, location: { lat: 12.9733, lng: 77.5946, accuracyM: 10 } }).outcome).toBe('accepted');
  });

  it('skips the location and phone checks when they are off', () => {
    const open = { ...QR_DEFAULTS, bindDevice: false };
    expect(qrVerdict(open, { ...base, deviceHash: null, boundDevice: null, location: null }).outcome).toBe('accepted');
  });

  it('hashes the install id per institution and counts minutes', () => {
    expect(deviceHashOf('t1', 'abc')).not.toBe(deviceHashOf('t2', 'abc'));
    expect(deviceHashOf('t1', 'abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(deviceHashOf('t1', undefined)).toBeNull();
    expect(minutesBetween('10:00:00', '10:55')).toBe(55);
    expect(minutesBetween('10:00', '09:58:30')).toBe(-2);
  });
});
