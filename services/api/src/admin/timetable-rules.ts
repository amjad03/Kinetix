import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { TIMETABLE_CAPACITY_CODE, TIMETABLE_CLASH_CODES } from '../common/error-codes.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, rooms, sections, students, subjects, timetableSlots, userRoles, users } from '../db/schema.js';

/**
 * The timetable's rules, shared by the timetable editor (timetable-admin.controller.ts) and the
 * timetable import (import/importers.ts): every id must be visible under row-level security, the
 * subject must be taught in the class's program and term, the teacher must be teaching staff, and
 * no class, teacher or room may be double-booked.
 */

export const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30');

export interface SlotInput {
  sectionId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

export type ClashKind = keyof typeof TIMETABLE_CLASH_CODES;

export interface Clash {
  kind: ClashKind;
  code: string;
  message: string;
}

/** The first active period that overlaps this one for the same class, teacher or room (ignoring `replacing`). */
export async function findClash(tx: Tx, b: SlotInput, replacing: string | null): Promise<Clash | null> {
  const clash = await tx
    .select({ section: sections.displayName, teacherId: timetableSlots.teacherId, roomId: timetableSlots.roomId, sectionId: timetableSlots.sectionId, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt })
    .from(timetableSlots)
    .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
    .where(
      and(
        isNull(timetableSlots.archivedAt),
        eq(timetableSlots.dayOfWeek, b.dayOfWeek),
        lt(timetableSlots.startsAt, b.endsAt),
        gt(timetableSlots.endsAt, b.startsAt),
        replacing ? ne(timetableSlots.id, replacing) : undefined,
        or(eq(timetableSlots.sectionId, b.sectionId), eq(timetableSlots.teacherId, b.teacherId), b.roomId ? eq(timetableSlots.roomId, b.roomId) : undefined),
      ),
    )
    .limit(1);
  if (!clash.length) return null;
  const c = clash[0];
  const when = `${c.startsAt.slice(0, 5)}–${c.endsAt.slice(0, 5)}`;
  const kind: ClashKind = c.sectionId === b.sectionId ? 'class' : c.teacherId === b.teacherId ? 'teacher' : 'room';
  const what = kind === 'class' ? `${c.section} already has a period` : kind === 'teacher' ? 'This teacher is already teaching' : 'This room is already booked';
  return { kind, code: TIMETABLE_CLASH_CODES[kind], message: `${what} at ${when} that day` };
}

/**
 * Checks every id under row-level security, then clashes: class, teacher or room double-booked.
 * Throws the HTTP error the editor shows (a clash is a 409 with a `TIMETABLE_*_CLASH` code); returns
 * the row to insert.
 */
export async function validateSlot(tx: Tx, b: SlotInput, replacing: string | null) {
  const [section] = await tx.select().from(sections).where(eq(sections.id, b.sectionId));
  if (!section) throw new NotFoundException('Class not found');
  const [subject] = await tx.select().from(subjects).where(eq(subjects.id, b.subjectId));
  if (!subject || subject.programId !== section.programId || subject.term !== section.term) throw new BadRequestException('That subject is not taught in this class');
  const [teacher] = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.id, b.teacherId), inArray(userRoles.role, ['teacher', 'hod', 'principal'])));
  if (!teacher) throw new BadRequestException('Choose a member of the teaching staff');
  if (b.roomId) {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, b.roomId));
    if (!room) throw new NotFoundException('Room not found');
    // A lab or room has only so many seats: the class must fit (rooms with no capacity set are not checked).
    if (room.capacity != null) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(and(eq(students.sectionId, section.id), eq(students.status, 'active')));
      if (n > room.capacity) throw new ConflictException({ statusCode: 409, message: `${room.name} seats ${room.capacity} but ${section.displayName} has ${n} students`, error: 'Conflict', code: TIMETABLE_CAPACITY_CODE });
    }
  }
  const clash = await findClash(tx, b, replacing);
  if (clash) throw new ConflictException({ statusCode: 409, message: clash.message, error: 'Conflict', code: clash.code });
  const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
  if (!year) throw new BadRequestException('Set the current academic year first');
  return { academicYearId: year.id, sectionId: section.id, subjectId: subject.id, teacherId: teacher.id, roomId: b.roomId ?? null, dayOfWeek: b.dayOfWeek, startsAt: b.startsAt, endsAt: b.endsAt };
}
