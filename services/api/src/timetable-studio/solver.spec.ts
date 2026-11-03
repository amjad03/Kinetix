import { describe, expect, it } from 'vitest';
import { bellToPeriods, solve, type Lesson, type SolverInput } from './solver.js';

const periods = [
  { startsAt: '09:00', endsAt: '09:50' },
  { startsAt: '09:50', endsAt: '10:40' },
  { startsAt: '11:00', endsAt: '11:50' },
  { startsAt: '11:50', endsAt: '12:40' },
  { startsAt: '13:30', endsAt: '14:20' },
  { startsAt: '14:20', endsAt: '15:10' },
];
const breakAfter = [false, true, false, true, false, false];

const base = (lessons: Lesson[], extra: Partial<SolverInput> = {}): SolverInput => ({
  days: [1, 2, 3, 4, 5],
  periods,
  breakAfter,
  sections: [
    { id: 'A', name: 'Sem 3 A', size: 60, batches: [{ name: 'B1', size: 30 }, { name: 'B2', size: 30 }] },
    { id: 'B', name: 'Sem 3 B', size: 55, batches: [] },
  ],
  rooms: [
    { id: 'R1', name: 'Room 101', kind: 'classroom', capacity: 60 },
    { id: 'R2', name: 'Room 102', kind: 'classroom', capacity: 70 },
    { id: 'HALL', name: 'Seminar hall', kind: 'seminar_hall', capacity: 150 },
    { id: 'L1', name: 'Computer lab 1', kind: 'lab', capacity: 30 },
    { id: 'L2', name: 'Computer lab 2', kind: 'lab', capacity: 30 },
  ],
  teachers: ['T1', 'T2', 'T3', 'T4'].map((id) => ({ id, name: id, maxPerWeek: 18, maxPerDay: 4, maxConsecutive: 3 })),
  lessons,
  teacherBusy: new Map(),
  roomBusy: new Map(),
  unavailable: new Map(),
  fixed: [],
  ...extra,
});

describe('timetable generator', () => {
  it('places every period without a clash and spreads a subject across the week', () => {
    const r = solve(base([
      { kind: 'theory', key: 'a-acc', label: 'Accounting A', sectionIds: ['A'], subjectId: 'ACC', teacherId: 'T1', perWeek: 5, maxPerDay: 1 },
      { kind: 'theory', key: 'b-acc', label: 'Accounting B', sectionIds: ['B'], subjectId: 'ACC', teacherId: 'T1', perWeek: 5, maxPerDay: 1 },
    ]));
    expect(r.unplaced).toEqual([]);
    expect(r.placements).toHaveLength(10);
    // One a day for each class: five different days.
    expect(new Set(r.placements.filter((p) => p.sectionId === 'A').map((p) => p.dayOfWeek)).size).toBe(5);
    // T1 never teaches two classes at once.
    const t1 = r.placements.map((p) => `${p.dayOfWeek}|${p.startsAt}`);
    expect(new Set(t1).size).toBe(10);
    // A class of 60 goes to the 60-seat room, the 55 in B too (smallest that fits); never the 30-seat labs.
    expect(r.placements.every((p) => p.roomId === 'R1' || p.roomId === 'R2')).toBe(true);
  });

  it('keeps a lab as consecutive periods that do not cross a break, runs the two batches in parallel in two labs', () => {
    const r = solve(base([
      { kind: 'lab', key: 'b1', label: 'Tally lab B1', sectionIds: ['A'], subjectId: 'TLY', teacherId: 'T2', perWeek: 1, length: 2, batch: 'B1' },
      { kind: 'lab', key: 'b2', label: 'Tally lab B2', sectionIds: ['A'], subjectId: 'TLY', teacherId: 'T3', perWeek: 1, length: 2, batch: 'B2' },
    ]));
    expect(r.unplaced).toEqual([]);
    const b1 = r.placements.filter((p) => p.batch === 'B1');
    const b2 = r.placements.filter((p) => p.batch === 'B2');
    expect(b1).toHaveLength(2);
    expect(b1[0].blockId).toBe(b1[1].blockId);
    expect(b1[0].endsAt).toBe(b1[1].startsAt); // back to back
    expect(['09:00', '11:00', '13:30', '14:20'].includes(b1[0].startsAt) && b1[0].startsAt !== '09:50').toBe(true);
    // Labs suit the afternoon: both batches meet at the same time in different labs.
    expect(b1.map((p) => p.startsAt)).toEqual(b2.map((p) => p.startsAt));
    expect(new Set([b1[0].roomId, b2[0].roomId])).toEqual(new Set(['L1', 'L2']));
  });

  it('honours a teacher\'s unavailability and weekly load, and says why a lesson could not be placed', () => {
    const allWeekMornings = new Map([['T4', [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startsAt: '09:00', endsAt: '12:40' }))]]);
    const r = solve(base([{ kind: 'theory', key: 'law', label: 'Business law A', sectionIds: ['A'], subjectId: 'LAW', teacherId: 'T4', perWeek: 4, maxPerDay: 1 }], { unavailable: allWeekMornings }));
    expect(r.placements.every((p) => p.startsAt >= '13:30')).toBe(true);
    expect(r.placements).toHaveLength(4);
    const capped = solve(base([{ kind: 'theory', key: 'law', label: 'Business law A', sectionIds: ['A'], subjectId: 'LAW', teacherId: 'T4', perWeek: 4, maxPerDay: 1 }], { teachers: [{ id: 'T4', name: 'T4', maxPerWeek: 3, maxPerDay: 4, maxConsecutive: 3 }] }));
    expect(capped.placements).toHaveLength(3);
    expect(capped.unplaced).toEqual([{ lessonKey: 'law', label: 'Business law A', sectionId: 'A', missing: 1, reason: 'teacher_load' }]);
  });

  it('meets a combined class once for both classes in a room that seats them all', () => {
    const r = solve(base([{ kind: 'theory', key: 'evs', label: 'Environmental studies', sectionIds: ['A', 'B'], subjectId: 'EVS', teacherId: 'T1', perWeek: 2, maxPerDay: 1 }]));
    expect(r.placements).toHaveLength(2);
    expect(r.placements.every((p) => p.sectionId === 'A' && p.combinedSectionIds?.[0] === 'B' && p.roomId === 'HALL')).toBe(true);
  });

  it('runs the options of an elective basket in parallel for every class, each with its own teacher and room', () => {
    const r = solve(base([
      { kind: 'elective', key: 'oe', label: 'Open elective', basketId: 'OE', sectionIds: ['A', 'B'], perWeek: 3, options: [
        { subjectId: 'MKT', subjectName: 'Digital marketing', teacherId: 'T1', size: 50 },
        { subjectId: 'FIN', subjectName: 'Personal finance', teacherId: 'T2', size: 40 },
        { subjectId: 'YOG', subjectName: 'Yoga', teacherId: 'T3', size: 25 },
      ] },
      { kind: 'theory', key: 'a-acc', label: 'Accounting A', sectionIds: ['A'], subjectId: 'ACC', teacherId: 'T4', perWeek: 4, maxPerDay: 1 },
    ]));
    expect(r.unplaced).toEqual([]);
    const oe = r.placements.filter((p) => p.basketId === 'OE');
    expect(oe).toHaveLength(9);
    const cells = new Set(oe.map((p) => `${p.dayOfWeek}|${p.startsAt}`));
    expect(cells.size).toBe(3); // three meetings, all options at once
    for (const c of cells) expect(new Set(oe.filter((p) => `${p.dayOfWeek}|${p.startsAt}` === c).map((p) => p.roomId)).size).toBe(3);
    // Accounting for A never collides with the elective.
    const acc = r.placements.filter((p) => p.subjectId === 'ACC').map((p) => `${p.dayOfWeek}|${p.startsAt}`);
    expect(acc.some((c) => cells.has(c))).toBe(false);
  });

  it('keeps locked periods and other classes\' teachers and rooms out of the way', () => {
    const r = solve(base([{ kind: 'theory', key: 'acc', label: 'Accounting A', sectionIds: ['A'], subjectId: 'ACC', teacherId: 'T1', perWeek: 5, maxPerDay: 1 }], {
      days: [1],
      teacherBusy: new Map([['T1', [{ dayOfWeek: 1, startsAt: '09:00', endsAt: '09:50' }]]]),
      fixed: [{ sectionId: 'A', batch: null, teacherId: 'T2', roomId: 'R1', subjectId: 'ECO', dayOfWeek: 1, startsAt: '09:50', endsAt: '10:40' }],
    }));
    expect(r.placements).toHaveLength(1);
    expect(r.placements[0].startsAt).toBe('11:00');
    expect(r.unplaced[0]).toMatchObject({ missing: 4, reason: 'subject_daily_limit' });
  });

  it('reads a bell schedule into periods and breaks', () => {
    const out = bellToPeriods([
      { startsAt: '09:00', endsAt: '09:50', kind: 'class' },
      { startsAt: '09:50', endsAt: '10:40', kind: 'class' },
      { startsAt: '10:40', endsAt: '11:00', kind: 'break' },
      { startsAt: '11:00', endsAt: '11:50', kind: 'class' },
      { startsAt: '13:00', endsAt: '13:50', kind: 'class' },
    ]);
    expect(out.periods.map((p) => p.startsAt)).toEqual(['09:00', '09:50', '11:00', '13:00']);
    expect(out.breakAfter).toEqual([false, true, true, false]);
  });
});
