import { describe, expect, it } from 'vitest';
import { clashesAt, slotsFor, type StudioSlot } from './timetable-studio';

const slot = (o: Partial<StudioSlot> & { id: string }): StudioSlot => ({
  sectionId: 'A',
  section: 'BCom Sem 3 A',
  subjectId: 'ACC',
  subject: 'Accounting',
  subjectCode: 'ACC',
  teacherId: 'T1',
  teacher: 'T1',
  roomId: 'R1',
  room: 'Room 101',
  dayOfWeek: 1,
  startsAt: '09:00',
  endsAt: '09:55',
  batch: null,
  combinedSectionIds: null,
  kind: 'theory',
  basketId: null,
  blockId: null,
  locked: false,
  ...o,
});

describe('timetable studio clash check while dragging', () => {
  const slots = [
    slot({ id: 'a1' }),
    slot({ id: 'a2', dayOfWeek: 2, teacherId: 'T2', roomId: 'R2' }),
    slot({ id: 'b1', sectionId: 'B', teacherId: 'T3', roomId: 'R3', dayOfWeek: 2, startsAt: '10:00', endsAt: '10:55' }),
    slot({ id: 'lab1', kind: 'lab', batch: 'B1', blockId: 'blk', teacherId: 'T4', roomId: 'L1', dayOfWeek: 3, startsAt: '14:00', endsAt: '14:55' }),
    slot({ id: 'lab2', kind: 'lab', batch: 'B1', blockId: 'blk', teacherId: 'T4', roomId: 'L1', dayOfWeek: 3, startsAt: '15:00', endsAt: '15:55' }),
    slot({ id: 'lab3', kind: 'lab', batch: 'B2', teacherId: 'T5', roomId: 'L2', dayOfWeek: 4, startsAt: '15:00', endsAt: '15:55' }),
    slot({ id: 'ev', sectionId: 'B', combinedSectionIds: ['A'], teacherId: 'T6', roomId: 'HALL', dayOfWeek: 5 }),
  ];
  it('finds the class, the teacher and the room', () => {
    expect(clashesAt(slots, slots[0], { dayOfWeek: 2, startsAt: '09:00' })).toEqual(['class']);
    expect(clashesAt(slots, slot({ id: 'x', sectionId: 'C', teacherId: 'T3', roomId: 'R9' }), { dayOfWeek: 2, startsAt: '10:00' })).toEqual(['teacher']);
    expect(clashesAt(slots, slot({ id: 'y', sectionId: 'C', teacherId: 'T9', roomId: 'R3' }), { dayOfWeek: 2, startsAt: '10:00' })).toEqual(['room']);
    expect(clashesAt(slots, slots[0], { dayOfWeek: 6, startsAt: '09:00' })).toEqual([]);
  });

  it('treats a combined class as the class, lets two batches meet at once, and moves a lab block together', () => {
    expect(clashesAt(slots, slots[0], { dayOfWeek: 5, startsAt: '09:00' })).toEqual(['class']);
    // The B1 block moved onto Thursday 14:00-15:55: its second period meets B2 there, which is fine.
    expect(clashesAt(slots, slots[3], { dayOfWeek: 4, startsAt: '14:00' })).toEqual([]);
    // A whole-class period there is not.
    expect(clashesAt([...slots, slot({ id: 'w', dayOfWeek: 4, startsAt: '15:00', endsAt: '15:55', teacherId: 'T7', roomId: 'R7' })], slots[3], { dayOfWeek: 4, startsAt: '14:00' })).toEqual(['class']);
  });

  it('lists what a view shows', () => {
    expect(slotsFor(slots, 'class', 'A').map((s) => s.id)).toEqual(['a1', 'a2', 'lab1', 'lab2', 'lab3', 'ev']);
    expect(slotsFor(slots, 'teacher', 'T4').map((s) => s.id)).toEqual(['lab1', 'lab2']);
    expect(slotsFor(slots, 'room', 'HALL').map((s) => s.id)).toEqual(['ev']);
  });
});
