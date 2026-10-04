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
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import { tenants, timetableSlots } from '../db/schema.js';
let TimetableService = class TimetableService {
    constructor(clock) {
        this.clock = clock;
    }
    async tenantTimezone(tx) {
        const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
        return t?.tz ?? 'Asia/Kolkata';
    }
    /**
     * The period the teacher is teaching right now. If they have two overlapping slots
     * (rare, but timetables are messy) the one in the board's room wins.
     */
    async currentSlotForTeacher(tx, teacherId, roomId) {
        const tz = await this.tenantTimezone(tx);
        const now = localParts(this.clock.now(), tz);
        const slots = await tx
            .select()
            .from(timetableSlots)
            .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.dayOfWeek, now.isoWeekday), isNull(timetableSlots.archivedAt), lte(timetableSlots.startsAt, now.time), gt(timetableSlots.endsAt, now.time)))
            .orderBy(asc(timetableSlots.startsAt));
        const slot = slots.find((s) => roomId && s.roomId === roomId) ?? slots[0];
        if (!slot)
            return null;
        return {
            id: slot.id,
            sectionId: slot.sectionId,
            subjectId: slot.subjectId,
            roomId: slot.roomId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            endsAtInstant: zonedToInstant(now.date, slot.endsAt, tz),
        };
    }
};
TimetableService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Clock])
], TimetableService);
export { TimetableService };
//# sourceMappingURL=timetable.service.js.map