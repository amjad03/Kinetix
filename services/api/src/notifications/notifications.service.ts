import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { PushService } from '../push/push.service.js';
import {
  attendanceRecords,
  notifications,
  students,
  subjects,
  timetableSlots,
  type BroadcastAudience,
} from '../db/schema.js';

type Kind = 'absence' | 'homework' | 'broadcast' | 'board_shared' | 'recording' | 'fee';

/** "₹45,000" or "₹1,250.50" from paise. */
export function rupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);
}

/** "Mon 5 Oct" for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

const hhmm = (t: string) => t.slice(0, 5);
const uuidList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/**
 * Creates in-app notifications for parents and students. Every write is idempotent per
 * (recipient, event) through the dedupe key, so retries and re-submissions never double up.
 * Each new (or revived) notification is also queued for a push to the recipient's phones.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly push: PushService) {}

  /**
   * After attendance for a period is written: guardians of students whose final mark is
   * absent are told; if an absence was corrected, the earlier notification is withdrawn.
   */
  async attendanceChanged(tx: Tx, slotId: string | null, date: string, studentIds: string[]): Promise<void> {
    if (studentIds.length === 0) return;
    const rows = await tx
      .select({
        studentId: attendanceRecords.studentId,
        status: attendanceRecords.status,
        studentName: students.fullName,
        subject: subjects.name,
        startsAt: timetableSlots.startsAt,
        endsAt: timetableSlots.endsAt,
      })
      .from(attendanceRecords)
      .innerJoin(students, eq(students.id, attendanceRecords.studentId))
      .leftJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
      .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .where(
        and(
          inArray(attendanceRecords.studentId, studentIds),
          eq(attendanceRecords.date, date),
          slotId ? eq(attendanceRecords.timetableSlotId, slotId) : isNull(attendanceRecords.timetableSlotId),
        ),
      );

    for (const r of rows) {
      const key = `absence:${r.studentId}:${date}:${slotId ?? 'day'}`;
      if (r.status === 'absent') {
        const period = r.subject ? ` for ${r.subject} (${hhmm(r.startsAt!)}–${hhmm(r.endsAt!)})` : '';
        await this.insertFor(
          tx,
          sql`select g.user_id from guardians g where g.student_id = ${r.studentId}::uuid
              union select s.user_id from students s where s.id = ${r.studentId}::uuid and s.user_id is not null`,
          {
            kind: 'absence',
            title: `${r.studentName.split(' ')[0]} was marked absent`,
            body: `${r.studentName} was marked absent${period} on ${shortDate(date)}. If this is wrong, please contact the class teacher.`,
            data: { studentId: r.studentId, date, ...(slotId ? { slotId } : {}) },
            dedupeKey: key,
          },
          { revive: true },
        );
      } else {
        // Corrected to present or late: withdraw the earlier absence alert.
        await tx
          .update(notifications)
          .set({ retractedAt: new Date() })
          .where(and(eq(notifications.dedupeKey, key), isNull(notifications.retractedAt)));
      }
    }
  }

  /** New homework: students of the class and their guardians. */
  async homeworkCreated(
    tx: Tx,
    hw: { id: string; sectionId: string; title: string; dueOn: string; subjectName: string },
  ): Promise<void> {
    await this.insertFor(tx, this.sectionAudience([hw.sectionId]), {
      kind: 'homework',
      title: `Homework: ${hw.subjectName}`,
      body: `${hw.title} · due ${shortDate(hw.dueOn)}`,
      data: { homeworkId: hw.id, sectionId: hw.sectionId },
      dedupeKey: `homework:${hw.id}`,
    });
  }

  /** A board shared with the class after the lesson. */
  async boardShared(tx: Tx, wb: { id: string; sectionId: string; title: string; subjectName: string | null }): Promise<void> {
    await this.insertFor(tx, this.sectionAudience([wb.sectionId]), {
      kind: 'board_shared',
      title: wb.subjectName ? `Today's board: ${wb.subjectName}` : "Today's board",
      body: `${wb.title}. Open it to revise what was taught in class.`,
      data: { whiteboardId: wb.id, sectionId: wb.sectionId },
      dedupeKey: `board:${wb.id}`,
    });
  }

  /**
   * A lesson recording shared with the class. Families of students who were absent from that
   * period get a "you missed this" message; everyone else gets the general one.
   */
  async recordingShared(
    tx: Tx,
    rec: { id: string; sectionId: string; title: string; subjectName: string | null; absentStudentIds: string[] },
  ): Promise<void> {
    const subject = rec.subjectName ?? 'class';
    const data = { recordingId: rec.id, sectionId: rec.sectionId };
    const dedupeKey = `recording:${rec.id}`;
    if (rec.absentStudentIds.length > 0) {
      const ids = uuidList(rec.absentStudentIds);
      await this.insertFor(
        tx,
        sql`select g.user_id from guardians g where g.student_id in (${ids})
            union select s.user_id from students s where s.id in (${ids}) and s.user_id is not null`,
        {
          kind: 'recording',
          title: `Missed ${subject}? Watch the lesson`,
          body: `${rec.title}. The teacher's board and voice are recorded so you can catch up.`,
          data,
          dedupeKey,
        },
      );
    }
    // Recipients already told above keep their message (the dedupe key matches).
    await this.insertFor(tx, this.sectionAudience([rec.sectionId]), {
      kind: 'recording',
      title: `Lesson recording: ${subject}`,
      body: `${rec.title}. Watch it again to revise.`,
      data,
      dedupeKey,
    });
  }

  /** Fees issued to students: their guardians and the students themselves. */
  async feeIssued(tx: Tx, f: { batchId: string; title: string; amountPaise: number; dueOn: string; studentIds: string[] }): Promise<void> {
    if (f.studentIds.length === 0) return;
    const ids = uuidList(f.studentIds);
    await this.insertFor(
      tx,
      sql`select g.user_id from guardians g where g.student_id in (${ids})
          union select s.user_id from students s where s.id in (${ids}) and s.user_id is not null`,
      {
        kind: 'fee',
        title: `Fee due: ${f.title}`,
        body: `${rupees(f.amountPaise)} due by ${shortDate(f.dueOn)}. Pay in the app or at the fees counter.`,
        data: { batchId: f.batchId },
        dedupeKey: `fee:${f.batchId}`,
      },
    );
  }

  /** A fee payment went through: the student's family gets the receipt number. */
  async feePaid(tx: Tx, p: { paymentId: string; studentId: string; studentName: string; title: string; amountPaise: number; receiptNo: string }): Promise<void> {
    await this.insertFor(
      tx,
      sql`select g.user_id from guardians g where g.student_id = ${p.studentId}::uuid
          union select s.user_id from students s where s.id = ${p.studentId}::uuid and s.user_id is not null`,
      {
        kind: 'fee',
        title: `Payment received: ${rupees(p.amountPaise)}`,
        body: `${p.title} for ${p.studentName}. Receipt ${p.receiptNo}.`,
        data: { paymentId: p.paymentId, studentId: p.studentId },
        dedupeKey: `fee-paid:${p.paymentId}`,
      },
    );
  }

  /** A principal's announcement reaches families of everyone in its audience. */
  async broadcastSent(tx: Tx, b: { id: string; title: string; body: string; audience: BroadcastAudience }): Promise<void> {
    const a = b.audience;
    let sectionFilter: SQL | null = null;
    if (!a.all) {
      const parts: SQL[] = [];
      if (a.sectionIds?.length) parts.push(sql`s.section_id in (${uuidList(a.sectionIds)})`);
      if (a.programIds?.length) parts.push(sql`sec.program_id in (${uuidList(a.programIds)})`);
      if (a.campusIds?.length) parts.push(sql`p.campus_id in (${uuidList(a.campusIds)})`);
      if (parts.length === 0) return; // device-only audience: boards, not families
      sectionFilter = sql.join(parts, sql` or `);
    }
    const students = sql`select s.id, s.user_id from students s
      join sections sec on sec.id = s.section_id
      join programs p on p.id = sec.program_id
      where s.status = 'active' ${sectionFilter ? sql`and (${sectionFilter})` : sql``}`;
    await this.insertFor(
      tx,
      sql`select g.user_id from guardians g where g.student_id in (select id from (${students}) st)
          union select st.user_id from (${students}) st where st.user_id is not null`,
      {
        kind: 'broadcast',
        title: b.title,
        body: b.body,
        data: { broadcastId: b.id },
        dedupeKey: `broadcast:${b.id}`,
      },
    );
  }

  /** Guardians and student accounts of the given classes. */
  private sectionAudience(sectionIds: string[]): SQL {
    return sql`select g.user_id from guardians g join students s on s.id = g.student_id
               where s.section_id in (${uuidList(sectionIds)}) and s.status = 'active'
               union
               select s.user_id from students s
               where s.section_id in (${uuidList(sectionIds)}) and s.status = 'active' and s.user_id is not null`;
  }

  private async insertFor(
    tx: Tx,
    recipients: SQL,
    n: { kind: Kind; title: string; body: string; data: Record<string, string>; dedupeKey: string },
    opts: { revive?: boolean } = {},
  ): Promise<void> {
    // A withdrawn absence that becomes an absence again is shown again, as unread.
    const onConflict = opts.revive
      ? sql`on conflict (user_id, dedupe_key) do update
            set retracted_at = null, read_at = null, title = excluded.title, body = excluded.body, created_at = now()
            where notifications.retracted_at is not null`
      : sql`on conflict (user_id, dedupe_key) do nothing`;
    const { rows } = await tx.execute<{ id: string; tenant_id: string }>(sql`
      insert into notifications (tenant_id, user_id, kind, title, body, data, dedupe_key)
      select current_setting('app.tenant_id')::uuid, r.user_id, ${n.kind}::notification_kind, ${n.title}, ${n.body},
             ${JSON.stringify(n.data)}::jsonb, ${n.dedupeKey}
      from (${recipients}) r(user_id)
      ${onConflict}
      returning id, tenant_id`);
    if (rows.length) await this.push.queue(tx, rows[0].tenant_id, rows.map((r) => r.id));
  }
}
