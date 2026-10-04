var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Clock, localParts } from '../common/time.js';
import { attendanceRecords, homework, rooms, sections, students, subjects, timetableSlots, users } from '../db/schema.js';
import { TimetableService } from '../timetable/timetable.service.js';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Validates YYYY-MM-DD and that it is a real calendar date. */
export function parseDate(value, field = 'date') {
    if (typeof value !== 'string' || !DATE.test(value))
        throw new BadRequestException(`${field} must be a date like 2026-10-05`);
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value)
        throw new BadRequestException(`${field} is not a valid date`);
    return value;
}
/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(date) {
    return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}
export function addDays(date, days) {
    return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
}
/** Principals and admins can see every class; teachers only the ones they are timetabled for. */
export function isSchoolAdmin(p) {
    return p.roles.some((r) => r === 'principal' || r === 'tenant_admin');
}
let TeacherService = class TeacherService {
    constructor(timetable, clock) {
        this.timetable = timetable;
        this.clock = clock;
    }
    async localNow(tx) {
        return localParts(this.clock.now(), await this.timetable.tenantTimezone(tx));
    }
    async timetableFor(tx, teacherId, date) {
        const now = await this.localNow(tx);
        const day = date ? parseDate(date) : now.date;
        const weekday = isoWeekday(day);
        const rows = await tx
            .select({
            slot: timetableSlots,
            section: { id: sections.id, displayName: sections.displayName },
            subject: { id: subjects.id, code: subjects.code, name: subjects.name },
            room: { id: rooms.id, name: rooms.name },
        })
            .from(timetableSlots)
            .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
            .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
            .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
            .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.dayOfWeek, weekday)))
            .orderBy(asc(timetableSlots.startsAt));
        const taken = new Set();
        if (rows.length) {
            const marked = await tx
                .selectDistinct({ slotId: attendanceRecords.timetableSlotId })
                .from(attendanceRecords)
                .where(and(eq(attendanceRecords.date, day), inArray(attendanceRecords.timetableSlotId, rows.map((r) => r.slot.id))));
            for (const m of marked)
                if (m.slotId)
                    taken.add(m.slotId);
        }
        const periods = rows.map((r) => ({
            slotId: r.slot.id,
            startsAt: r.slot.startsAt,
            endsAt: r.slot.endsAt,
            section: r.section,
            subject: r.subject,
            room: r.room?.id ? { id: r.room.id, name: r.room.name } : null,
            isNow: day === now.date && r.slot.startsAt <= now.time && now.time < r.slot.endsAt,
            attendanceTaken: taken.has(r.slot.id),
        }));
        // The next day with classes, so an empty Sunday can point at Monday.
        const days = await tx
            .selectDistinct({ day: timetableSlots.dayOfWeek })
            .from(timetableSlots)
            .where(eq(timetableSlots.teacherId, teacherId));
        const teachingDays = new Set(days.map((d) => d.day));
        let nextTeachingDate = null;
        for (let i = 1; i <= 7; i++) {
            const candidate = addDays(day, i);
            if (teachingDays.has(isoWeekday(candidate))) {
                nextTeachingDate = candidate;
                break;
            }
        }
        return { date: day, today: now.date, isoWeekday: weekday, periods, nextTeachingDate };
    }
    /** The section, looked up under RLS (so ids from other tenants are simply not found). */
    async section(tx, sectionId) {
        const [s] = await tx.select().from(sections).where(eq(sections.id, sectionId));
        if (!s)
            throw new NotFoundException('Class not found');
        return s;
    }
    async teachesSection(tx, teacherId, sectionId) {
        const [slot] = await tx
            .select({ id: timetableSlots.id })
            .from(timetableSlots)
            .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.sectionId, sectionId)))
            .limit(1);
        return !!slot;
    }
    async assertCanSeeSection(tx, p, sectionId) {
        const section = await this.section(tx, sectionId);
        if (!isSchoolAdmin(p) && !(await this.teachesSection(tx, p.userId, sectionId))) {
            throw new ForbiddenException('You do not teach this class');
        }
        return section;
    }
    /** The slot under RLS. Teachers may only use their own periods; principals and admins any. */
    async slotFor(tx, p, slotId) {
        const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, slotId));
        if (!slot)
            throw new NotFoundException('Period not found');
        if (slot.teacherId !== p.userId && !isSchoolAdmin(p))
            throw new ForbiddenException('This is not your period');
        return slot;
    }
    async attendanceSheet(tx, slotId, date) {
        const records = await tx
            .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
            .from(attendanceRecords)
            .where(and(eq(attendanceRecords.timetableSlotId, slotId), eq(attendanceRecords.date, date)));
        const counts = { present: 0, absent: 0, late: 0, excused: 0 };
        for (const r of records)
            counts[r.status]++;
        return { slotId, date, taken: records.length > 0, records, counts };
    }
    async homeworkList(tx, where, order) {
        const rows = await tx
            .select({
            hw: homework,
            section: { id: sections.id, displayName: sections.displayName },
            subject: { id: subjects.id, code: subjects.code, name: subjects.name },
            createdBy: { id: users.id, fullName: users.fullName },
        })
            .from(homework)
            .innerJoin(sections, eq(sections.id, homework.sectionId))
            .innerJoin(subjects, eq(subjects.id, homework.subjectId))
            .innerJoin(users, eq(users.id, homework.createdBy))
            .where(where)
            .orderBy(order === 'due' ? desc(homework.dueOn) : desc(homework.createdAt), desc(homework.createdAt))
            .limit(50);
        return rows.map((r) => ({
            id: r.hw.id,
            title: r.hw.title,
            instructions: r.hw.instructions,
            dueOn: r.hw.dueOn,
            createdAt: r.hw.createdAt.toISOString(),
            section: r.section,
            subject: r.subject,
            createdBy: r.createdBy,
            boardSessionId: r.hw.boardSessionId,
        }));
    }
    /** Students of a section, looked up under RLS: the ids that are really in this class. */
    async studentsInSection(tx, sectionId, ids) {
        if (!ids.length)
            return new Set();
        const found = await tx
            .select({ id: students.id })
            .from(students)
            .where(and(eq(students.sectionId, sectionId), inArray(students.id, ids), sql `${students.status} = 'active'`));
        return new Set(found.map((s) => s.id));
    }
};
TeacherService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [TimetableService,
        Clock])
], TeacherService);
export { TeacherService };
//# sourceMappingURL=teacher.service.js.map