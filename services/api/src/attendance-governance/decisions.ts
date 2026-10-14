import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { attendanceCondonations, attendanceCorrections, attendanceRecords, students } from '../db/schema.js';
import { attendancePolicy, attendanceWindow, eligibilityFor } from './policy.js';

/** Decide corrections: heads of department and the principal. */
export const CORRECTION_DECIDERS: RoleName[] = ['hod', 'principal', 'tenant_admin'];
export const CONDONATION_DECIDERS: RoleName[] = ['principal', 'tenant_admin'];

/** Approving a correction applies it to the register; both are audited with the before and after. */
export async function decideCorrection(tx: Tx, p: UserPrincipal, id: string, decision: 'approved' | 'rejected', note: string, now: Date) {
  const [c] = await tx.select().from(attendanceCorrections).where(eq(attendanceCorrections.id, id)).for('update');
  if (!c) throw new NotFoundException('Correction not found');
  if (c.status !== 'pending') throw new ConflictException('This correction was already decided');
  if (c.requestedBy === p.userId) throw new ForbiddenException('Someone else must decide your own request');
  if (decision === 'approved') {
    await tx
      .insert(attendanceRecords)
      .values({ tenantId: p.tenantId, studentId: c.studentId, sectionId: c.sectionId, date: c.date, timetableSlotId: c.timetableSlotId, status: c.toStatus, markedBy: p.userId, occurredAt: now })
      .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status: c.toStatus, markedBy: p.userId, occurredAt: now, updatedAt: now } });
  }
  const [row] = await tx.update(attendanceCorrections).set({ status: decision, decidedBy: p.userId, decidedAt: now, decisionNote: note }).where(eq(attendanceCorrections.id, id)).returning();
  await auditUser(tx, p, `attendance.correction.${decision}`, 'attendance_correction', id, { studentId: c.studentId, date: c.date, from: c.fromStatus, to: c.toStatus, requestedBy: c.requestedBy, note, changes: { status: { before: 'pending', after: decision } } });
  return row;
}

/**
 * The principal decides a condonation and sets the percentage points that count towards eligibility: no more than
 * the office's condonation limit, and not for a student below the university's condonation floor. With a condonation
 * fee the points count once the fee is paid or waived.
 */
export async function decideCondonation(tx: Tx, p: UserPrincipal, id: string, b: { decision: 'approved' | 'rejected'; points: number; note: string; feePaise?: number }, now: Date, today: string) {
  const [c] = await tx.select().from(attendanceCondonations).where(eq(attendanceCondonations.id, id)).for('update');
  if (!c) throw new NotFoundException('Condonation request not found');
  if (c.status !== 'pending') throw new ConflictException('This request was already decided');
  let feePaise = 0;
  if (b.decision === 'approved') {
    if (b.points < 1) throw new BadRequestException('Give the percentage points to add');
    const [stu] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, c.studentId));
    const policy = await attendancePolicy(tx, stu.sectionId);
    if (b.points > policy.maxCondonationPoints) throw new BadRequestException(`At most ${policy.maxCondonationPoints} points can be condoned (Academics settings)`);
    const [e] = await eligibilityFor(tx, [c.studentId], policy, await attendanceWindow(tx, stu.sectionId, today));
    const tally = c.subjectId ? e.subjects.find((x) => x.subjectId === c.subjectId) : e.overall;
    if (policy.condonableToPct !== null && tally?.pct != null && tally.pct < policy.condonableToPct) {
      throw new ConflictException(`Attendance is ${tally.pct}%: below ${policy.condonableToPct}% a shortage cannot be condoned under ${policy.profile?.name ?? 'the rules in force'}`);
    }
    feePaise = b.feePaise ?? policy.condonationFeePaise;
  }
  const [row] = await tx
    .update(attendanceCondonations)
    .set({ status: b.decision, approvedPoints: b.decision === 'approved' ? b.points : 0, decidedBy: p.userId, decidedAt: now, decisionNote: b.note, feePaise, feeStatus: feePaise > 0 ? 'due' : 'none' })
    .where(eq(attendanceCondonations.id, id))
    .returning();
  await auditUser(tx, p, `attendance.condonation.${b.decision}`, 'attendance_condonation', id, { studentId: c.studentId, points: row.approvedPoints, note: b.note, feePaise, changes: { status: { before: 'pending', after: b.decision } } });
  return row;
}

/** Records the condonation fee as paid (with the receipt) or waives it (the principal); the points count from then on. */
export async function recordCondonationFee(tx: Tx, p: UserPrincipal, id: string, b: { action: 'paid' | 'waived'; receipt?: string; note?: string }, now: Date) {
  const [c] = await tx.select().from(attendanceCondonations).where(eq(attendanceCondonations.id, id)).for('update');
  if (!c) throw new NotFoundException('Condonation request not found');
  if (c.feeStatus !== 'due') throw new ConflictException('No fee is due on this condonation');
  if (b.action === 'paid' && !b.receipt) throw new BadRequestException('Enter the receipt number');
  if (b.action === 'waived' && !p.roles.some((r) => CONDONATION_DECIDERS.includes(r))) throw new ForbiddenException('Only the principal can waive the fee');
  const [row] = await tx.update(attendanceCondonations).set({ feeStatus: b.action, feeReceipt: b.receipt ?? null, feePaidAt: now }).where(eq(attendanceCondonations.id, id)).returning();
  await auditUser(tx, p, `attendance.condonation.fee_${b.action}`, 'attendance_condonation', id, { studentId: c.studentId, feePaise: c.feePaise, receipt: b.receipt ?? null, note: b.note ?? null, changes: { feeStatus: { before: 'due', after: b.action } } });
  return row;
}
