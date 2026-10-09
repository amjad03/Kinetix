import { createHmac, timingSafeEqual } from 'node:crypto';
import { zonedToInstant } from '../common/time.js';

export const QR_TTL_SECONDS = 30;

function dayAfter(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * A day's attendance locks `lockHours` after that day ends (local time). Null/undefined = never locks.
 * Once locked, changes go through a correction request.
 */
export function attendanceLocked(day: string, now: Date, timeZone: string, lockHours: number | null | undefined): boolean {
  if (lockHours === null || lockHours === undefined) return false;
  const dayEnd = zonedToInstant(dayAfter(day), '00:00:00', timeZone);
  return now.getTime() >= dayEnd.getTime() + lockHours * 3_600_000;
}

/** Percentage of attended sessions (present or late); excused sessions are left out of the count. */
export function attendancePct(present: number, late: number, absent: number): number | null {
  const total = present + late + absent;
  return total === 0 ? null : Math.round(((present + late) / total) * 1000) / 10;
}

/** The percentage after condonation, capped at 100. */
export function effectivePct(pct: number | null, condonedPoints: number): number | null {
  return pct === null ? null : Math.min(100, Math.round((pct + condonedPoints) * 10) / 10);
}

const WINDOW_MS = QR_TTL_SECONDS * 1000;

/** The 8-digit code for one period on one day during one 30-second window. */
function codeFor(secret: string, tenantId: string, slotId: string, date: string, windowNo: number): string {
  const h = createHmac('sha256', secret).update(`qr-attendance|${tenantId}|${slotId}|${date}|${windowNo}`).digest();
  return String(h.readUInt32BE(0) % 100_000_000).padStart(8, '0');
}

/** A short code the teacher shows on screen for one period; it changes every 30 seconds. */
export function makeQrCode(secret: string, tenantId: string, slotId: string, date: string, now: Date): { code: string; expiresAt: string } {
  const windowNo = Math.floor(now.getTime() / WINDOW_MS);
  return { code: codeFor(secret, tenantId, slotId, date, windowNo), expiresAt: new Date((windowNo + 1) * WINDOW_MS).toISOString() };
}

export type QrCheck = { ok: true; slotId: string } | { ok: false; reason: 'malformed' | 'invalid' };

/**
 * Which of today's candidate periods (the student's class) this code belongs to. The current and the
 * previous window both count, so a code read just before it rotates still works for a few seconds.
 */
export function checkQrCode(secret: string, tenantId: string, raw: string, candidates: { slotId: string; date: string }[], now: Date): QrCheck {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{8}$/.test(digits)) return { ok: false, reason: 'malformed' };
  const windowNo = Math.floor(now.getTime() / WINDOW_MS);
  const got = Buffer.from(digits);
  for (const c of candidates) {
    for (const w of [windowNo, windowNo - 1]) {
      const want = Buffer.from(codeFor(secret, tenantId, c.slotId, c.date, w));
      if (timingSafeEqual(want, got)) return { ok: true, slotId: c.slotId };
    }
  }
  return { ok: false, reason: 'invalid' };
}
