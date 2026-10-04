import { Injectable } from '@nestjs/common';
import type { SyncOpResult } from '@kinetix/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { BoardPrincipal } from '../auth/principal.js';
import { localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { attendanceRecords, boardSessions, participationEvents, students, syncOps } from '../db/schema.js';
import { TimetableService } from '../timetable/timetable.service.js';

export interface IncomingOp {
  opId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

class Rejection extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies outbox operations from a board, idempotently by opId.
 * See docs/architecture/sync-protocol.md.
 */
@Injectable()
export class SyncService {
  constructor(private readonly timetable: TimetableService) {}

  async push(tx: Tx, p: BoardPrincipal, ops: IncomingOp[]): Promise<SyncOpResult[]> {
    const [session] = await tx.select().from(boardSessions).where(eq(boardSessions.id, p.sessionId));
    const tz = await this.timetable.tenantTimezone(tx);
    const results: SyncOpResult[] = [];

    for (const op of ops) {
      const [seen] = await tx
        .select({ status: syncOps.status, reason: syncOps.reason })
        .from(syncOps)
        .where(and(eq(syncOps.tenantId, p.tenantId), eq(syncOps.opId, op.opId)));
      if (seen) {
        results.push(seen.status === 'applied' ? { opId: op.opId, status: 'duplicate' } : { opId: op.opId, status: 'rejected', reason: seen.reason ?? 'rejected' });
        continue;
      }

      let result: SyncOpResult;
      try {
        // A savepoint per operation: one bad op does not undo the rest of the batch.
        await tx.transaction(async (sp) => this.apply(sp, p, session, tz, op));
        result = { opId: op.opId, status: 'applied' };
      } catch (e) {
        if (!(e instanceof Rejection)) throw e;
        result = { opId: op.opId, status: 'rejected', reason: e.message };
      }
      await tx.insert(syncOps).values({
        opId: op.opId,
        tenantId: p.tenantId,
        type: op.type,
        deviceId: p.deviceId,
        actorId: p.teacherId,
        status: result.status,
        reason: result.status === 'rejected' ? result.reason : null,
      });
      results.push(result);
    }
    return results;
  }

  private async apply(tx: Tx, p: BoardPrincipal, session: typeof boardSessions.$inferSelect, tz: string, op: IncomingOp): Promise<void> {
    const occurredAt = new Date(op.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new Rejection('invalid occurredAt');

    switch (op.type) {
      case 'attendance.marked': {
        const studentId = await this.studentInSession(tx, session, op.payload.studentId);
        const status = op.payload.status;
        if (status !== 'present' && status !== 'absent' && status !== 'late' && status !== 'excused') {
          throw new Rejection('invalid status');
        }
        await tx
          .insert(attendanceRecords)
          .values({
            tenantId: p.tenantId,
            studentId,
            sectionId: session.sectionId!,
            date: localParts(occurredAt, tz).date,
            timetableSlotId: session.timetableSlotId,
            status,
            markedBy: p.teacherId,
            occurredAt,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId],
            set: { status, markedBy: p.teacherId, occurredAt, updatedAt: new Date() },
            // Last writer wins by the time the mark was made, not the time it reached us.
            setWhere: sql`${attendanceRecords.occurredAt} <= excluded.occurred_at`,
          });
        // TODO: enqueue parent notification for 'absent' once the notification worker exists.
        return;
      }
      case 'participation.recorded': {
        const studentId = await this.studentInSession(tx, session, op.payload.studentId);
        const outcome = op.payload.outcome;
        if (outcome !== 'correct' && outcome !== 'partial' && outcome !== 'incorrect' && outcome !== 'skipped') {
          throw new Rejection('invalid outcome');
        }
        await tx.insert(participationEvents).values({
          tenantId: p.tenantId,
          studentId,
          boardSessionId: session.id,
          subjectId: session.subjectId,
          topicCode: typeof op.payload.topicCode === 'string' ? op.payload.topicCode : null,
          note: typeof op.payload.note === 'string' ? op.payload.note.slice(0, 500) : null,
          outcome,
          recordedBy: p.teacherId,
          occurredAt,
        });
        return;
      }
      default:
        throw new Rejection(`unknown operation type ${op.type}`);
    }
  }

  /**
   * Foreign keys are checked without RLS, so a student id from another tenant would pass the
   * FK constraint. Look the student up under RLS, and require them to be in this class.
   */
  private async studentInSession(tx: Tx, session: typeof boardSessions.$inferSelect, studentId: unknown): Promise<string> {
    if (!session.sectionId) throw new Rejection('this session has no class attached');
    if (typeof studentId !== 'string' || !UUID.test(studentId)) throw new Rejection('studentId must be a UUID');
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.sectionId, session.sectionId)));
    if (!s) throw new Rejection('student is not in this class');
    return s.id;
  }
}
