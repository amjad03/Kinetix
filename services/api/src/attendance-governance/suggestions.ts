import { sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';

/** A hint on a mark sheet that a student was in the room: a classroom reader tap, or a QR scan held for review. */
export interface PeriodHint {
  studentId: string;
  source: 'reader' | 'qr';
  /** When the tap or scan happened (ISO). */
  at: string;
  /** finger, face, card... for a reader tap. */
  verify: string | null;
  /** A held QR scan: its id (to accept or reject) and why it was held. */
  scanId: string | null;
  reasons: string[];
}

/**
 * Taps on the classroom reader in the period's room (devices with a room) and QR scans held for review, per student,
 * for the teacher to confirm on the sheet. Nothing here is a mark until the teacher saves the sheet or accepts the scan.
 */
export async function periodHints(tx: Tx, slotId: string, date: string): Promise<PeriodHint[]> {
  const taps = await tx.execute<{ student_id: string; at: string; verify: string | null }>(sql`
    select distinct on (subject_id) subject_id as student_id, event_at::text as at, detail->>'verify' as verify
    from device_events where outcome = 'period_tap' and subject_type = 'student' and detail->>'slotId' = ${slotId} and detail->>'date' = ${date}
    order by subject_id, event_at`);
  const held = await tx.execute<{ id: string; student_id: string; at: string; reasons: string[] }>(sql`
    select id, student_id, created_at::text as at, reasons from attendance_qr_scans
    where timetable_slot_id = ${slotId}::uuid and date = ${date}::date and outcome = 'flagged' and decision is null`);
  return [
    ...taps.rows.map((t) => ({ studentId: t.student_id, source: 'reader' as const, at: new Date(t.at).toISOString(), verify: t.verify, scanId: null, reasons: [] })),
    ...held.rows.map((h) => ({ studentId: h.student_id, source: 'qr' as const, at: new Date(h.at).toISOString(), verify: null, scanId: h.id, reasons: h.reasons })),
  ];
}
