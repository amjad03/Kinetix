import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { PushService } from '../push/push.service.js';
import { dateIn, texts, type Localized, type Text } from './texts.js';
import {
  attendanceRecords,
  notifications,
  students,
  subjects,
  timetableSlots,
  type BroadcastAudience,
} from '../db/schema.js';

type Kind = 'absence' | 'homework' | 'broadcast' | 'board_shared' | 'recording' | 'fee' | 'library' | 'marks' | 'message' | 'live' | 'calendar';

export { rupees } from './texts.js';

/** "Mon 5 Oct" for a YYYY-MM-DD date. */
export const shortDate = (date: string) => dateIn('en', date);

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
        await this.insertFor(
          tx,
          sql`select g.user_id from guardians g where g.student_id = ${r.studentId}::uuid
              union select s.user_id from students s where s.id = ${r.studentId}::uuid and s.user_id is not null`,
          {
            kind: 'absence',
            text: texts.absence({ studentName: r.studentName, date, subject: r.subject, from: r.startsAt ? hhmm(r.startsAt) : undefined, to: r.endsAt ? hhmm(r.endsAt) : undefined }),
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
      text: texts.homework({ subject: hw.subjectName, title: hw.title, dueOn: hw.dueOn }),
      data: { homeworkId: hw.id, sectionId: hw.sectionId },
      dedupeKey: `homework:${hw.id}`,
    });
  }

  /** The teacher checked or returned a student's homework: the student and their family. */
  async homeworkReviewed(tx: Tx, r: { homeworkId: string; studentId: string; studentName: string; title: string; status: 'checked' | 'returned'; remark: string | null }): Promise<void> {
    await this.insertFor(tx, this.studentAndFamily(r.studentId), {
      kind: 'homework',
      text: texts.homeworkReviewed(r),
      data: { homeworkId: r.homeworkId, studentId: r.studentId },
      dedupeKey: `homework-review:${r.homeworkId}:${r.studentId}`,
    }, { replace: true });
  }

  /** A board shared with the class after the lesson. */
  async boardShared(tx: Tx, wb: { id: string; sectionId: string; title: string; subjectName: string | null }): Promise<void> {
    await this.insertFor(tx, this.sectionAudience([wb.sectionId]), {
      kind: 'board_shared',
      text: texts.boardShared({ subject: wb.subjectName, title: wb.title }),
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
          text: texts.recordingMissed({ subject: rec.subjectName, title: rec.title }),
          data,
          dedupeKey,
        },
      );
    }
    // Recipients already told above keep their message (the dedupe key matches).
    await this.insertFor(tx, this.sectionAudience([rec.sectionId]), {
      kind: 'recording',
      text: texts.recordingShared({ subject: rec.subjectName, title: rec.title }),
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
        text: texts.feeIssued({ title: f.title, amountPaise: f.amountPaise, dueOn: f.dueOn }),
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
        text: texts.feePaid({ title: p.title, amountPaise: p.amountPaise, studentName: p.studentName, receiptNo: p.receiptNo }),
        data: { paymentId: p.paymentId, studentId: p.studentId },
        dedupeKey: `fee-paid:${p.paymentId}`,
      },
    );
  }

  /** The student and their family: used by events about one student. */
  private studentAndFamily(studentId: string): SQL {
    return sql`select g.user_id from guardians g where g.student_id = ${studentId}::uuid
               union select s.user_id from students s where s.id = ${studentId}::uuid and s.user_id is not null`;
  }

  async libraryIssued(tx: Tx, l: { loanId: string; studentId: string; studentName: string; title: string; dueOn: string }): Promise<void> {
    await this.insertFor(tx, this.studentAndFamily(l.studentId), {
      kind: 'library',
      text: texts.libraryIssued({ studentName: l.studentName, title: l.title, dueOn: l.dueOn }),
      data: { loanId: l.loanId, studentId: l.studentId },
      dedupeKey: `library:${l.loanId}`,
    });
  }

  /** Marks published for a class: each student and their family. */
  async marksPublished(tx: Tx, a: { id: string; sectionId: string; title: string; subjectName: string }): Promise<void> {
    await this.insertFor(tx, this.sectionAudience([a.sectionId]), {
      kind: 'marks',
      text: texts.marksPublished({ subject: a.subjectName, title: a.title }),
      data: { assessmentId: a.id, sectionId: a.sectionId },
      dedupeKey: `marks:${a.id}`,
    });
  }

  /** A new message in a conversation, for the other side. */
  async messageSent(tx: Tx, m: { id: string; conversationId: string; recipientId: string; senderName: string; body: string; studentId: string }): Promise<void> {
    const preview = m.body.length > 120 ? `${m.body.slice(0, 117)}…` : m.body;
    await this.insertFor(tx, sql`select ${m.recipientId}::uuid`, {
      kind: 'message',
      text: texts.message({ senderName: m.senderName, preview }),
      data: { conversationId: m.conversationId, studentId: m.studentId },
      dedupeKey: `message:${m.id}`,
    });
  }

  /** The teacher started a live class: the students of the class (not families). */
  async liveClass(tx: Tx, l: { sessionId: string; sectionId: string; subjectName: string | null; teacherName: string }): Promise<void> {
    await this.insertFor(
      tx,
      sql`select s.user_id from students s where s.section_id = ${l.sectionId}::uuid and s.status = 'active' and s.user_id is not null`,
      {
        kind: 'live',
        text: texts.live({ subject: l.subjectName, teacherName: l.teacherName }),
        data: { sessionId: l.sessionId, sectionId: l.sectionId },
        dedupeKey: `live:${l.sessionId}`,
      },
    );
  }

  /** A holiday, exam or event for families and students (of the listed programs, or everyone). */
  async calendarEvent(tx: Tx, e: { id: string; kind: 'holiday' | 'exam' | 'event'; title: string; startsOn: string; endsOn: string; programIds: string[] | null }): Promise<void> {
    const inScope = e.programIds?.length ? sql`and s.section_id in (select id from sections where program_id in (${uuidList(e.programIds)}))` : sql``;
    await this.insertFor(
      tx,
      sql`select g.user_id from guardians g join students s on s.id = g.student_id where s.status = 'active' ${inScope}
          union
          select s.user_id from students s where s.status = 'active' and s.user_id is not null ${inScope}`,
      { kind: 'calendar', text: texts.calendar(e), data: { calendarEventId: e.id, startsOn: e.startsOn }, dedupeKey: `calendar:${e.id}` },
      { replace: true },
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
        // The principal's own words, in whatever language they wrote them.
        text: { title: b.title, body: b.body },
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
    n: { kind: Kind; text: Localized | Text; data: Record<string, string>; dedupeKey: string },
    opts: { revive?: boolean; replace?: boolean } = {},
  ): Promise<void> {
    // A withdrawn absence that becomes an absence again is shown again, as unread; a changed
    // entry (calendar, a second review) replaces the earlier text and is shown as new.
    const onConflict = opts.replace
      ? sql`on conflict (user_id, dedupe_key) do update
            set retracted_at = null, read_at = null, title = excluded.title, body = excluded.body, data = excluded.data, created_at = now()`
      : opts.revive
        ? sql`on conflict (user_id, dedupe_key) do update
              set retracted_at = null, read_at = null, title = excluded.title, body = excluded.body, created_at = now()
              where notifications.retracted_at is not null`
        : sql`on conflict (user_id, dedupe_key) do nothing`;
    // Each recipient gets the text in their own preferred language.
    const t = 'title' in n.text ? { en: n.text, hi: n.text, kn: n.text } : n.text;
    const pick = (f: 'title' | 'body') => sql`case u.preferred_language when 'hi' then ${t.hi[f]} when 'kn' then ${t.kn[f]} else ${t.en[f]} end`;
    const { rows } = await tx.execute<{ id: string; tenant_id: string }>(sql`
      insert into notifications (tenant_id, user_id, kind, title, body, data, dedupe_key)
      select current_setting('app.tenant_id')::uuid, r.user_id, ${n.kind}::notification_kind, ${pick('title')}, ${pick('body')},
             ${JSON.stringify(n.data)}::jsonb, ${n.dedupeKey}
      from (${recipients}) r(user_id)
      join users u on u.id = r.user_id
      ${onConflict}
      returning id, tenant_id`);
    if (rows.length) await this.push.queue(tx, rows[0].tenant_id, rows.map((r) => r.id));
  }
}
