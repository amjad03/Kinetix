import { createHash } from 'node:crypto';
import type { QrRules } from '../academics/academics-rules.js';
import { haversineM } from '../common/ops.js';

/**
 * The anti-proxy checks on a QR self-mark, as a pure function so the rules can be tested on their own.
 *
 * Refused (nothing is recorded but the attempt): the period is over, or this phone already marked another student in
 * this period, or the phone is bound to another student. Flagged (held for the teacher to accept or reject): no phone
 * id, a phone other than the student's bound one, no location or a poor fix or a mocked location when the geofence
 * is on, outside the geofence, or later than the grace minutes after the period starts. Otherwise accepted.
 */
export type QrReason =
  | 'period_over'
  | 'device_used_for_another'
  | 'device_bound_to_another'
  | 'no_device'
  | 'new_device'
  | 'no_location'
  | 'poor_accuracy'
  | 'mock_location'
  | 'outside_campus'
  | 'late_scan';

export const REFUSING: QrReason[] = ['period_over', 'device_used_for_another', 'device_bound_to_another'];

export interface QrScanFacts {
  /** Minutes since the period started (negative before it starts) and the period's length. */
  minutesIn: number;
  periodMinutes: number;
  deviceHash: string | null;
  /** The phone the student is bound to (null = not bound yet). */
  boundDevice: string | null;
  /** This phone is the active binding of another student. */
  deviceBoundToOther: boolean;
  /** This phone already has an accepted or waiting scan for another student in this period. */
  deviceUsedInSlot: boolean;
  location: { lat: number; lng: number; accuracyM: number; mocked?: boolean } | null;
}

export interface QrVerdict {
  outcome: 'accepted' | 'flagged' | 'refused';
  reasons: QrReason[];
  distanceM: number | null;
  /** Bind this phone to the student now (first scan from a phone nobody else holds). */
  bind: boolean;
}

/** Minutes after the period ends that the code still works (a teacher closing the period a little late). */
export const QR_AFTER_END_MINUTES = 5;

export function qrVerdict(rules: QrRules, f: QrScanFacts): QrVerdict {
  const reasons: QrReason[] = [];
  if (f.minutesIn > f.periodMinutes + QR_AFTER_END_MINUTES) reasons.push('period_over');
  if (f.deviceHash && f.deviceUsedInSlot) reasons.push('device_used_for_another');
  if (rules.bindDevice && f.deviceHash && f.deviceBoundToOther && f.boundDevice !== f.deviceHash) reasons.push('device_bound_to_another');
  if (rules.bindDevice) {
    if (!f.deviceHash) reasons.push('no_device');
    else if (f.boundDevice && f.boundDevice !== f.deviceHash) reasons.push('new_device');
  }
  let distanceM: number | null = null;
  if (f.location && rules.lat !== null && rules.lng !== null) distanceM = Math.round(haversineM({ lat: f.location.lat, lng: f.location.lng }, { lat: rules.lat, lng: rules.lng }));
  if (rules.requireLocation) {
    if (!f.location) reasons.push('no_location');
    else {
      if (f.location.mocked) reasons.push('mock_location');
      if (f.location.accuracyM > rules.maxAccuracyM) reasons.push('poor_accuracy');
      if (distanceM !== null && distanceM > rules.radiusM) reasons.push('outside_campus');
    }
  }
  if (f.minutesIn > rules.lateMinutes) reasons.push('late_scan');
  const refused = reasons.some((r) => REFUSING.includes(r));
  return {
    outcome: refused ? 'refused' : reasons.length ? 'flagged' : 'accepted',
    reasons,
    distanceM,
    bind: !refused && rules.bindDevice && !!f.deviceHash && !f.boundDevice && !f.deviceBoundToOther,
  };
}

/** The stored form of the app's install id: a tenant-scoped hash, so the raw id never reaches the database or logs. */
export function deviceHashOf(tenantId: string, installId: string | undefined | null): string | null {
  if (!installId) return null;
  return createHash('sha256').update(`attendance-device|${tenantId}|${installId}`).digest('hex');
}

/** Minutes between two HH:MM[:SS] times. */
export function minutesBetween(from: string, to: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(to) - m(from);
}
