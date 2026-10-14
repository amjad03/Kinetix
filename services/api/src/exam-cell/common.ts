import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { examPapers, examSessions, students, supplementaryRegistrations } from '../db/schema.js';

/** Who runs the exam cell: the controller of examinations, the principal, the administrator. */
export const CELL: RoleName[] = ['tenant_admin', 'principal', 'exam_controller'];
/** Who may read the cell's registers: also heads of department. */
export const CELL_READ: RoleName[] = [...CELL, 'hod'];
/** Staff who work the halls and valuation (invigilators, examiners). */
export const CELL_STAFF: RoleName[] = [...CELL_READ, 'teacher', 'examiner'];

export type SessionRow = typeof examSessions.$inferSelect;

export async function loadSession(tx: Tx, id: string): Promise<SessionRow> {
  const [s] = await tx.select().from(examSessions).where(eq(examSessions.id, id));
  if (!s) throw new NotFoundException('Exam session not found');
  return s;
}

/** Results exist (processed, published or locked). */
export const hasResults = (s: SessionRow) => s.status === 'processed' || s.status === 'published' || s.status === 'locked';

/** Whether a student sits the session: in one of its classes, or registered for one of its subjects. */
export async function inSession(tx: Tx, sessionId: string, studentId: string): Promise<boolean> {
  const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
  if (!st) return false;
  const [paper] = await tx.select({ id: examPapers.id }).from(examPapers).where(and(eq(examPapers.sessionId, sessionId), eq(examPapers.sectionId, st.sectionId))).limit(1);
  if (paper) return true;
  const [reg] = await tx.select({ id: supplementaryRegistrations.id }).from(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, sessionId), eq(supplementaryRegistrations.studentId, studentId))).limit(1);
  return !!reg;
}

export async function assertInSession(tx: Tx, sessionId: string, studentId: string): Promise<void> {
  if (!(await inSession(tx, sessionId, studentId))) throw new ConflictException('The student does not sit this examination');
}

/** Rows of a raw query. */
export async function rowsOf<T = Record<string, unknown>>(tx: Tx, q: SQL): Promise<T[]> {
  return (await tx.execute(q)).rows as T[];
}

/** An audit entry by the signed-in user, with the record before and after when given. */
export const auditCell = (tx: Tx, p: UserPrincipal, action: string, subjectType: string, subjectId: string, extra: { data?: unknown; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null } = {}) =>
  audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action, subjectType, subjectId, ...extra });

/** Students' ids as a SQL list. */
export const idList = (ids: string[]) => sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `);

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Session options for record kit filters and pickers: newest first. */
export async function sessionOptions(tx: Tx) {
  const rows = await tx.select({ id: examSessions.id, name: examSessions.name }).from(examSessions).orderBy(sql`${examSessions.startsOn} desc`);
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

