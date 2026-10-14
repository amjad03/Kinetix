import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { readSettings } from '../campus-ops/settings.js';
import { auditUser } from '../common/audit.js';
import { todayIn } from '../common/lht-kit.js';
import type { Tx } from '../db/db.service.js';
import { applications, hostelAllotments, hostelBeds, hostelBlocks, hostelGatePasses, hostelRooms, hostelTransfers, messSubscriptions, sections, students } from '../db/schema.js';
import { hostelApplications, hostelBedHolds, hostelDeposits, hostels, hostelSettlements } from '../db/schema-lht.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { genderFits, settle } from './hostel-rules.js';

/** Allotment, vacating, transfers and gate events, shared by the warden's desk and the record lists. */

/** The hostel a block belongs to; a block made before hostels existed goes to the first hostel (made if none). */
export async function defaultHostel(tx: Tx, tenantId: string): Promise<string> {
  const [h] = await tx.select({ id: hostels.id }).from(hostels).orderBy(asc(hostels.sortOrder), asc(hostels.createdAt)).limit(1);
  if (h) return h.id;
  const [made] = await tx.insert(hostels).values({ tenantId, name: 'Main hostel' }).returning({ id: hostels.id });
  return made.id;
}

/** What is known of a student's gender: their hostel application, else their admission application. */
export async function studentGender(tx: Tx, studentId: string): Promise<string | null> {
  const [a] = await tx.select({ g: hostelApplications.gender }).from(hostelApplications).where(and(eq(hostelApplications.studentId, studentId), ne(hostelApplications.gender, ''))).orderBy(desc(hostelApplications.createdAt)).limit(1);
  if (a?.g) return a.g;
  const [b] = await tx.select({ g: applications.gender }).from(students).innerJoin(applications, eq(applications.id, students.applicationId)).where(eq(students.id, studentId));
  return b?.g ?? null;
}

/** The bed with its room, block and hostel. */
export async function bedPlace(tx: Tx, bedId: string) {
  const [b] = await tx
    .select({ bed: hostelBeds, room: hostelRooms, block: hostelBlocks, hostel: hostels })
    .from(hostelBeds)
    .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
    .innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId))
    .leftJoin(hostels, eq(hostels.id, hostelBlocks.hostelId))
    .where(eq(hostelBeds.id, bedId));
  if (!b) throw new NotFoundException('Bed not found');
  return b;
}

/**
 * Whether the student may have this bed: the room is open, the bed is not held for someone else, and the hostel's
 * gender and year rules allow them (a block's own rules come before its hostel's).
 */
export async function checkBed(tx: Tx, studentId: string, bedId: string, today: string): Promise<void> {
  const b = await bedPlace(tx, bedId);
  if (b.room.status !== 'available') throw new ConflictException(`Room ${b.room.number} is ${b.room.status === 'maintenance' ? 'under maintenance' : 'closed'}`);
  const [hold] = await tx.select().from(hostelBedHolds).where(and(eq(hostelBedHolds.bedId, bedId), eq(hostelBedHolds.status, 'active'), sql`${hostelBedHolds.untilOn} >= ${today}::date`));
  if (hold && hold.studentId !== studentId) throw new ConflictException(`This bed is held (${hold.reason}) until ${hold.untilOn}`);
  const gender = await studentGender(tx, studentId);
  const hostelGender = b.block.gender !== 'mixed' ? b.block.gender : (b.hostel?.gender ?? 'mixed');
  if (!genderFits(hostelGender, gender)) throw new ConflictException(`This is a ${hostelGender === 'boys' ? 'boys’' : 'girls’'} hostel`);
  const allowed = b.block.allowedTerms.length ? b.block.allowedTerms : (b.hostel?.allowedTerms ?? []);
  if (allowed.length) {
    const [s] = await tx.select({ term: sections.term }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (s && !allowed.includes(s.term)) throw new ConflictException(`This hostel takes students of year or semester ${allowed.join(', ')} only`);
  }
}

/** Gives a student a bed after the rules check; a hold for that student on the bed becomes the allotment. */
export async function allotBed(tx: Tx, p: UserPrincipal, now: Date, studentId: string, bedId: string, startsOn?: string) {
  const [student] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.status, 'active')));
  if (!student) throw new NotFoundException('Student not found');
  const today = await todayIn(tx, now);
  await checkBed(tx, studentId, bedId, today);
  const [taken] = await tx.select({ id: hostelAllotments.id }).from(hostelAllotments).where(and(eq(hostelAllotments.bedId, bedId), isNull(hostelAllotments.vacatedOn)));
  if (taken) throw new ConflictException('That bed is taken');
  const [has] = await tx.select({ id: hostelAllotments.id }).from(hostelAllotments).where(and(eq(hostelAllotments.studentId, studentId), isNull(hostelAllotments.vacatedOn)));
  if (has) throw new ConflictException('This student already has a bed');
  const [a] = await tx.insert(hostelAllotments).values({ tenantId: p.tenantId, studentId, bedId, startsOn: startsOn ?? today, createdBy: p.userId }).returning();
  await tx.update(hostelBedHolds).set({ status: 'converted' }).where(and(eq(hostelBedHolds.bedId, bedId), eq(hostelBedHolds.status, 'active'), eq(hostelBedHolds.studentId, studentId)));
  await auditUser(tx, p, 'hostel.allotted', 'hostel_allotment', a.id, { studentId, bedId });
  return a;
}

/**
 * Vacates a bed: refused while the student is out on a gate pass. Unused passes are cancelled, the mess plan ends,
 * and a settlement is worked out (the unused part of the month's room fee, the held deposit, less damages and dues).
 */
export async function vacate(tx: Tx, p: UserPrincipal, now: Date, allotmentId: string, o: { on?: string; reason?: string; damagesPaise?: number; duesPaise?: number; refundUnusedFee?: boolean } = {}) {
  const [a] = await tx.select().from(hostelAllotments).where(eq(hostelAllotments.id, allotmentId)).for('update');
  if (!a) throw new NotFoundException('Allotment not found');
  if (a.vacatedOn) return { allotment: a, settlement: null };
  const [out] = await tx.select({ id: hostelGatePasses.id }).from(hostelGatePasses).where(and(eq(hostelGatePasses.studentId, a.studentId), eq(hostelGatePasses.status, 'out')));
  if (out) throw new ConflictException('The student is out on a gate pass');
  const today = await todayIn(tx, now);
  const on = o.on ?? today;
  if (on < a.startsOn) throw new BadRequestException('The vacate date is before the student moved in');
  const [done] = await tx.update(hostelAllotments).set({ vacatedOn: on, vacateReason: o.reason ?? '' }).where(eq(hostelAllotments.id, allotmentId)).returning();
  await tx.update(hostelGatePasses).set({ status: 'cancelled' }).where(and(eq(hostelGatePasses.studentId, a.studentId), sql`${hostelGatePasses.status} in ('issued', 'requested', 'approved', 'parent_pending')`));
  await tx.update(messSubscriptions).set({ endedOn: on }).where(and(eq(messSubscriptions.studentId, a.studentId), isNull(messSubscriptions.endedOn)));
  await tx.update(hostelBedHolds).set({ status: 'released' }).where(and(eq(hostelBedHolds.studentId, a.studentId), eq(hostelBedHolds.status, 'active')));
  const { room } = await bedPlace(tx, a.bedId);
  const held = await tx.select().from(hostelDeposits).where(and(eq(hostelDeposits.studentId, a.studentId), eq(hostelDeposits.status, 'held')));
  const deposit = held.reduce((t, d) => t + d.amountPaise, 0);
  const s = settle({ vacatedOn: on, monthlyFeePaise: room.monthlyFeePaise, refundUnusedFee: o.refundUnusedFee ?? true, depositPaise: deposit, damagesPaise: o.damagesPaise ?? 0, duesPaise: o.duesPaise ?? 0 });
  const [st] = await tx
    .insert(hostelSettlements)
    .values({ tenantId: p.tenantId, allotmentId, studentId: a.studentId, vacatedOn: on, monthlyFeePaise: room.monthlyFeePaise, daysUsed: s.daysUsed, daysInMonth: s.daysInMonth, prorataRefundPaise: s.prorataRefundPaise, depositPaise: deposit, damagesPaise: o.damagesPaise ?? 0, duesPaise: o.duesPaise ?? 0, netRefundPaise: s.netRefundPaise, createdBy: p.userId })
    .returning();
  await auditUser(tx, p, 'hostel.vacated', 'hostel_allotment', allotmentId, { vacatedOn: on, reason: o.reason, settlementId: st.id, netRefundPaise: s.netRefundPaise });
  return { allotment: done, settlement: st };
}

/** Moves a resident to another bed: the old allotment closes, the new one opens, and the move is kept. */
export async function transfer(tx: Tx, p: UserPrincipal, now: Date, allotmentId: string, bedId: string, reason: string) {
  const [a] = await tx.select().from(hostelAllotments).where(eq(hostelAllotments.id, allotmentId)).for('update');
  if (!a) throw new NotFoundException('Allotment not found');
  if (a.vacatedOn) throw new ConflictException('This student has already left the bed');
  if (a.bedId === bedId) throw new BadRequestException('The student is already in that bed');
  const today = await todayIn(tx, now);
  await checkBed(tx, a.studentId, bedId, today);
  const [taken] = await tx.select({ id: hostelAllotments.id }).from(hostelAllotments).where(and(eq(hostelAllotments.bedId, bedId), isNull(hostelAllotments.vacatedOn)));
  if (taken) throw new ConflictException('That bed is taken');
  await tx.update(hostelAllotments).set({ vacatedOn: today, vacateReason: `Moved: ${reason}` }).where(eq(hostelAllotments.id, allotmentId));
  const [next] = await tx.insert(hostelAllotments).values({ tenantId: p.tenantId, studentId: a.studentId, bedId, startsOn: today, createdBy: p.userId }).returning();
  await tx.insert(hostelTransfers).values({ tenantId: p.tenantId, studentId: a.studentId, fromBedId: a.bedId, toBedId: bedId, reason, movedOn: today, movedBy: p.userId });
  await auditUser(tx, p, 'hostel.room_transferred', 'hostel_allotment', next.id, { from: a.bedId, to: bedId, reason });
  return next;
}

/** The student goes out of or comes back through the gate; the family is told. */
export async function gateMove(tx: Tx, p: UserPrincipal, now: Date, notifications: NotificationsService, id: string, to: 'out' | 'in') {
  const [pass] = await tx.select().from(hostelGatePasses).where(eq(hostelGatePasses.id, id)).for('update');
  if (!pass) throw new NotFoundException('Pass not found');
  // A pass approved without the warden (when the hostel's rules allow it) goes out like an issued one.
  const from = to === 'out' ? ['issued', 'approved'] : ['out'];
  if (!from.includes(pass.status)) throw new ConflictException(`This pass is ${pass.status.replace('_', ' ')}`);
  const [done] = await tx
    .update(hostelGatePasses)
    .set(to === 'out' ? { status: 'out', outAt: now } : { status: 'returned', inAt: now })
    .where(eq(hostelGatePasses.id, id))
    .returning();
  const [st] = await tx.select({ fullName: students.fullName }).from(students).where(eq(students.id, pass.studentId));
  await notifications.hostelGate(tx, { passId: id, studentId: pass.studentId, studentName: st?.fullName ?? 'Your child', event: to });
  await auditUser(tx, p, `hostel.gate_${to}`, 'hostel_gate_pass', id);
  return done;
}

/** The warden decides a requested pass. */
export async function decidePass(tx: Tx, p: UserPrincipal, id: string, to: 'issued' | 'rejected') {
  const [pass] = await tx.update(hostelGatePasses).set({ status: to, issuedBy: p.userId }).where(and(eq(hostelGatePasses.id, id), eq(hostelGatePasses.status, 'requested'))).returning();
  if (!pass) throw new ConflictException('Only a requested pass can be approved or rejected');
  await auditUser(tx, p, `hostel.pass_${to === 'issued' ? 'approved' : 'rejected'}`, 'hostel_gate_pass', id);
  return pass;
}

/** The status a student's own pass request starts in under the hostel's rules. */
export async function requestStatus(tx: Tx, tenantId: string, byStudent: boolean): Promise<{ status: string; parentStatus: string | null }> {
  const hr = (await readSettings(tx, tenantId, 'hostel')).rules;
  if (byStudent && hr.outpassNeedsParentApproval) return { status: 'parent_pending', parentStatus: 'pending' };
  return { status: hr.outpassNeedsApproval ? 'requested' : 'approved', parentStatus: byStudent ? null : 'approved' };
}

/** The resident's current allotment, or null. */
export async function residentOf(tx: Tx, studentId: string) {
  const [a] = await tx.select().from(hostelAllotments).where(and(eq(hostelAllotments.studentId, studentId), isNull(hostelAllotments.vacatedOn)));
  return a ?? null;
}
