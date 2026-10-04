var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, NotFoundException } from '@nestjs/common';
import { RealtimeEvents } from '@kinetix/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { boardSessions, sections, students, subjects, timetableSlots, users } from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
let SessionsService = class SessionsService {
    constructor(realtime) {
        this.realtime = realtime;
    }
    async context(tx, sessionId) {
        const [row] = await tx
            .select({
            session: boardSessions,
            teacher: { id: users.id, fullName: users.fullName, preferredLanguage: users.preferredLanguage },
            section: { id: sections.id, displayName: sections.displayName },
            subject: { id: subjects.id, code: subjects.code, name: subjects.name },
            slot: { id: timetableSlots.id, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt },
        })
            .from(boardSessions)
            .innerJoin(users, eq(users.id, boardSessions.teacherId))
            .leftJoin(sections, eq(sections.id, boardSessions.sectionId))
            .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
            .leftJoin(timetableSlots, eq(timetableSlots.id, boardSessions.timetableSlotId))
            .where(eq(boardSessions.id, sessionId));
        if (!row)
            throw new NotFoundException('Session not found');
        return {
            sessionId: row.session.id,
            expiresAt: row.session.expiresAt.toISOString(),
            teacher: row.teacher,
            section: row.section,
            subject: row.subject,
            period: row.slot ? { slotId: row.slot.id, startsAt: row.slot.startsAt, endsAt: row.slot.endsAt } : null,
        };
    }
    async roster(tx, sectionId) {
        return tx
            .select({ id: students.id, rollNo: students.rollNo, fullName: students.fullName })
            .from(students)
            .where(and(eq(students.sectionId, sectionId), eq(students.status, 'active')))
            .orderBy(asc(students.rollNo));
    }
    /** Ends every open session on a device. Returns the ids that were ended. */
    async endActiveOnDevice(tx, tenantId, deviceId, reason) {
        const ended = await tx
            .update(boardSessions)
            .set({ endedAt: new Date(), endReason: reason })
            .where(and(eq(boardSessions.deviceId, deviceId), isNull(boardSessions.endedAt)))
            .returning({ id: boardSessions.id });
        for (const s of ended) {
            await audit(tx, { tenantId, actorType: 'system', action: 'board_session.ended', subjectType: 'board_session', subjectId: s.id, data: { reason } });
        }
        return ended.map((s) => s.id);
    }
    async end(tx, tenantId, sessionId, reason, notify) {
        const [s] = await tx
            .update(boardSessions)
            .set({ endedAt: new Date(), endReason: reason })
            .where(and(eq(boardSessions.id, sessionId), isNull(boardSessions.endedAt)))
            .returning({ id: boardSessions.id, deviceId: boardSessions.deviceId });
        if (!s)
            return;
        await audit(tx, { tenantId, actorType: 'system', action: 'board_session.ended', subjectType: 'board_session', subjectId: s.id, data: { reason } });
        if (notify)
            this.realtime.toDevices([s.deviceId], RealtimeEvents.SessionEnded, { sessionId: s.id, reason });
        this.realtime.liveEnded(s.deviceId, 'class_ended');
    }
};
SessionsService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [RealtimeGateway])
], SessionsService);
export { SessionsService };
//# sourceMappingURL=sessions.service.js.map