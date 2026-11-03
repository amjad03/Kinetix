import { ForbiddenException } from '@nestjs/common';
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { qual } from '../common/lht-kit.js';
import type { Tx } from '../db/db.service.js';

/**
 * Wardens limited to their blocks. A hostel warden who is assigned (on the hostel staff list, serving today) sees and
 * acts on the blocks of that assignment only: the blocks named on it, or the whole hostel when none are named. A
 * warden with no current assignment is a chief warden and sees every hostel, as do the principal and the admin.
 */

const OVERSEERS = ['tenant_admin', 'principal'];
const serving = sql.raw(`hs.from_on <= current_date and (hs.until_on is null or hs.until_on >= current_date)`);

/** True when the person sees every block (no scope applies). */
export const seesAll = (p: UserPrincipal) => p.roles.some((r) => OVERSEERS.includes(r)) || !p.roles.includes('hostel_warden');

/** SQL true when the block (an id expression) is one the person looks after; undefined when they see every block. */
export function blockScope(p: UserPrincipal, block: AnyColumn | SQL): SQL | undefined {
  if (seesAll(p)) return undefined;
  const b = 'table' in block ? qual(block as AnyColumn) : block;
  return sql`(not exists (select 1 from hostel_staff hs where hs.user_id = ${p.userId}::uuid and ${serving})
    or ${b} in (select k.id from hostel_blocks k join hostel_staff hs on hs.hostel_id = k.hostel_id
                where hs.user_id = ${p.userId}::uuid and ${serving} and (cardinality(hs.block_ids) = 0 or k.id = any(hs.block_ids))))`;
}

/** SQL true when the room is in the person's blocks. */
export function roomScope(p: UserPrincipal, room: AnyColumn | SQL): SQL | undefined {
  if (seesAll(p)) return undefined;
  const r = 'table' in room ? qual(room as AnyColumn) : room;
  return sql`${r} in (select sr.id from hostel_rooms sr where ${blockScope(p, sql.raw('sr.block_id'))})`;
}

/** SQL true when the student lives (or lived) in the person's blocks. */
export function studentScope(p: UserPrincipal, student: AnyColumn | SQL): SQL | undefined {
  if (seesAll(p)) return undefined;
  const s = 'table' in student ? qual(student as AnyColumn) : student;
  return sql`exists (select 1 from hostel_allotments sa join hostel_beds sb on sb.id = sa.bed_id join hostel_rooms sr on sr.id = sb.room_id
                     where sa.student_id = ${s} and ${blockScope(p, sql.raw('sr.block_id'))})`;
}

/** SQL true when a complaint is about a room or a resident of the person's blocks. */
export function complaintScope(p: UserPrincipal): SQL | undefined {
  if (seesAll(p)) return undefined;
  return sql`((hostel_complaints.room_id is not null and ${roomScope(p, sql.raw('hostel_complaints.room_id'))})
    or (hostel_complaints.student_id is not null and ${studentScope(p, sql.raw('hostel_complaints.student_id'))}))`;
}

/** Refuses a warden acting on a resident outside their blocks. */
export async function assertStudentInScope(tx: Tx, p: UserPrincipal, studentId: string): Promise<void> {
  const where = studentScope(p, sql`${studentId}::uuid`);
  if (!where) return;
  const r = await tx.execute<{ ok: boolean }>(sql`select ${where} as ok`);
  if (!r.rows[0]?.ok) throw new ForbiddenException('This resident is not in a block you look after');
}

/** Refuses a warden acting on a room outside their blocks. */
export async function assertRoomInScope(tx: Tx, p: UserPrincipal, roomId: string): Promise<void> {
  const where = roomScope(p, sql`${roomId}::uuid`);
  if (!where) return;
  const r = await tx.execute<{ ok: boolean }>(sql`select ${where} as ok`);
  if (!r.rows[0]?.ok) throw new ForbiddenException('This room is not in a block you look after');
}
