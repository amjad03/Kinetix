var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { PushService } from '../push/push.service.js';
import { attendanceRecords, notifications, students, subjects, timetableSlots, } from '../db/schema.js';
/** "₹45,000" or "₹1,250.50" from paise. */
export function rupees(paise) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);
}
/** "Mon 5 Oct" for a YYYY-MM-DD date. */
export function shortDate(date) {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
const hhmm = (t) => t.slice(0, 5);
const uuidList = (ids) => sql.join(ids.map((id) => sql `${id}::uuid`), sql `, `);
/**
 * Creates in-app notifications for parents and students. Every write is idempotent per
 * (recipient, event) through the dedupe key, so retries and re-submissions never double up.
 * Each new (or revived) notification is also queued for a push to the recipient's phones.
 */
let NotificationsService = class NotificationsService {
    constructor(push) {
        this.push = push;
    }
    /**
     * After attendance for a period is written: guardians of students whose final mark is
     * absent are told; if an absence was corrected, the earlier notification is withdrawn.
     */
    async attendanceChanged(tx, slotId, date, studentIds) {
        if (studentIds.length === 0)
            return;
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
            .where(and(inArray(attendanceRecords.studentId, studentIds), eq(attendanceRecords.date, date), slotId ? eq(attendanceRecords.timetableSlotId, slotId) : isNull(attendanceRecords.timetableSlotId)));
        for (const r of rows) {
            const key = `absence:${r.studentId}:${date}:${slotId ?? 'day'}`;
            if (r.status === 'absent') {
                const period = r.subject ? ` for ${r.subject} (${hhmm(r.startsAt)}–${hhmm(r.endsAt)})` : '';
                await this.insertFor(tx, sql `select g.user_id from guardians g where g.student_id = ${r.studentId}::uuid
              union select s.user_id from students s where s.id = ${r.studentId}::uuid and s.user_id is not null`, {
                    kind: 'absence',
                    title: `${r.studentName.split(' ')[0]} was marked absent`,
                    body: `${r.studentName} was marked absent${period} on ${shortDate(date)}. If this is wrong, please contact the class teacher.`,
                    data: { studentId: r.studentId, date, ...(slotId ? { slotId } : {}) },
                    dedupeKey: key,
                }, { revive: true });
            }
            else {
                // Corrected to present or late: withdraw the earlier absence alert.
                await tx
                    .update(notifications)
                    .set({ retractedAt: new Date() })
                    .where(and(eq(notifications.dedupeKey, key), isNull(notifications.retractedAt)));
            }
        }
    }
    /** New homework: students of the class and their guardians. */
    async homeworkCreated(tx, hw) {
        await this.insertFor(tx, this.sectionAudience([hw.sectionId]), {
            kind: 'homework',
            title: `Homework: ${hw.subjectName}`,
            body: `${hw.title} · due ${shortDate(hw.dueOn)}`,
            data: { homeworkId: hw.id, sectionId: hw.sectionId },
            dedupeKey: `homework:${hw.id}`,
        });
    }
    /** A board shared with the class after the lesson. */
    async boardShared(tx, wb) {
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
    async recordingShared(tx, rec) {
        const subject = rec.subjectName ?? 'class';
        const data = { recordingId: rec.id, sectionId: rec.sectionId };
        const dedupeKey = `recording:${rec.id}`;
        if (rec.absentStudentIds.length > 0) {
            const ids = uuidList(rec.absentStudentIds);
            await this.insertFor(tx, sql `select g.user_id from guardians g where g.student_id in (${ids})
            union select s.user_id from students s where s.id in (${ids}) and s.user_id is not null`, {
                kind: 'recording',
                title: `Missed ${subject}? Watch the lesson`,
                body: `${rec.title}. The teacher's board and voice are recorded so you can catch up.`,
                data,
                dedupeKey,
            });
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
    async feeIssued(tx, f) {
        if (f.studentIds.length === 0)
            return;
        const ids = uuidList(f.studentIds);
        await this.insertFor(tx, sql `select g.user_id from guardians g where g.student_id in (${ids})
          union select s.user_id from students s where s.id in (${ids}) and s.user_id is not null`, {
            kind: 'fee',
            title: `Fee due: ${f.title}`,
            body: `${rupees(f.amountPaise)} due by ${shortDate(f.dueOn)}. Pay in the app or at the fees counter.`,
            data: { batchId: f.batchId },
            dedupeKey: `fee:${f.batchId}`,
        });
    }
    /** A fee payment went through: the student's family gets the receipt number. */
    async feePaid(tx, p) {
        await this.insertFor(tx, sql `select g.user_id from guardians g where g.student_id = ${p.studentId}::uuid
          union select s.user_id from students s where s.id = ${p.studentId}::uuid and s.user_id is not null`, {
            kind: 'fee',
            title: `Payment received: ${rupees(p.amountPaise)}`,
            body: `${p.title} for ${p.studentName}. Receipt ${p.receiptNo}.`,
            data: { paymentId: p.paymentId, studentId: p.studentId },
            dedupeKey: `fee-paid:${p.paymentId}`,
        });
    }
    /** The student and their family: used by events about one student. */
    studentAndFamily(studentId) {
        return sql `select g.user_id from guardians g where g.student_id = ${studentId}::uuid
               union select s.user_id from students s where s.id = ${studentId}::uuid and s.user_id is not null`;
    }
    async libraryIssued(tx, l) {
        await this.insertFor(tx, this.studentAndFamily(l.studentId), {
            kind: 'library',
            title: `Library book borrowed: ${l.title}`,
            body: `${l.studentName.split(' ')[0]} borrowed "${l.title}". Please return it by ${shortDate(l.dueOn)}.`,
            data: { loanId: l.loanId, studentId: l.studentId },
            dedupeKey: `library:${l.loanId}`,
        });
    }
    /** Marks published for a class: each student and their family. */
    async marksPublished(tx, a) {
        await this.insertFor(tx, this.sectionAudience([a.sectionId]), {
            kind: 'marks',
            title: `Marks published: ${a.subjectName}`,
            body: `${a.title}. Open the app to see the marks and the class average.`,
            data: { assessmentId: a.id, sectionId: a.sectionId },
            dedupeKey: `marks:${a.id}`,
        });
    }
    /** A new message in a conversation, for the other side. */
    async messageSent(tx, m) {
        const preview = m.body.length > 120 ? `${m.body.slice(0, 117)}…` : m.body;
        await this.insertFor(tx, sql `select ${m.recipientId}::uuid`, {
            kind: 'message',
            title: `Message from ${m.senderName}`,
            body: preview,
            data: { conversationId: m.conversationId, studentId: m.studentId },
            dedupeKey: `message:${m.id}`,
        });
    }
    /** The teacher started a live class: the students of the class (not families). */
    async liveClass(tx, l) {
        await this.insertFor(tx, sql `select s.user_id from students s where s.section_id = ${l.sectionId}::uuid and s.status = 'active' and s.user_id is not null`, {
            kind: 'live',
            title: `Live now: ${l.subjectName ?? 'class'}`,
            body: `${l.teacherName} is teaching live. Open KINETIX to watch the board.`,
            data: { sessionId: l.sessionId, sectionId: l.sectionId },
            dedupeKey: `live:${l.sessionId}`,
        });
    }
    /** A principal's announcement reaches families of everyone in its audience. */
    async broadcastSent(tx, b) {
        const a = b.audience;
        let sectionFilter = null;
        if (!a.all) {
            const parts = [];
            if (a.sectionIds?.length)
                parts.push(sql `s.section_id in (${uuidList(a.sectionIds)})`);
            if (a.programIds?.length)
                parts.push(sql `sec.program_id in (${uuidList(a.programIds)})`);
            if (a.campusIds?.length)
                parts.push(sql `p.campus_id in (${uuidList(a.campusIds)})`);
            if (parts.length === 0)
                return; // device-only audience: boards, not families
            sectionFilter = sql.join(parts, sql ` or `);
        }
        const students = sql `select s.id, s.user_id from students s
      join sections sec on sec.id = s.section_id
      join programs p on p.id = sec.program_id
      where s.status = 'active' ${sectionFilter ? sql `and (${sectionFilter})` : sql ``}`;
        await this.insertFor(tx, sql `select g.user_id from guardians g where g.student_id in (select id from (${students}) st)
          union select st.user_id from (${students}) st where st.user_id is not null`, {
            kind: 'broadcast',
            title: b.title,
            body: b.body,
            data: { broadcastId: b.id },
            dedupeKey: `broadcast:${b.id}`,
        });
    }
    /** Guardians and student accounts of the given classes. */
    sectionAudience(sectionIds) {
        return sql `select g.user_id from guardians g join students s on s.id = g.student_id
               where s.section_id in (${uuidList(sectionIds)}) and s.status = 'active'
               union
               select s.user_id from students s
               where s.section_id in (${uuidList(sectionIds)}) and s.status = 'active' and s.user_id is not null`;
    }
    async insertFor(tx, recipients, n, opts = {}) {
        // A withdrawn absence that becomes an absence again is shown again, as unread.
        const onConflict = opts.revive
            ? sql `on conflict (user_id, dedupe_key) do update
            set retracted_at = null, read_at = null, title = excluded.title, body = excluded.body, created_at = now()
            where notifications.retracted_at is not null`
            : sql `on conflict (user_id, dedupe_key) do nothing`;
        const { rows } = await tx.execute(sql `
      insert into notifications (tenant_id, user_id, kind, title, body, data, dedupe_key)
      select current_setting('app.tenant_id')::uuid, r.user_id, ${n.kind}::notification_kind, ${n.title}, ${n.body},
             ${JSON.stringify(n.data)}::jsonb, ${n.dedupeKey}
      from (${recipients}) r(user_id)
      ${onConflict}
      returning id, tenant_id`);
        if (rows.length)
            await this.push.queue(tx, rows[0].tenant_id, rows.map((r) => r.id));
    }
};
NotificationsService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PushService])
], NotificationsService);
export { NotificationsService };
//# sourceMappingURL=notifications.service.js.map