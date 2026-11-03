// The timetable generator: fills the week of several classes at once under the institution's constraints. Pure (no
// database), deterministic (the same input gives the same timetable) and explainable (every lesson it could not place
// says why).
//
// Constraints it keeps:
// - a class (or one of its lab batches), a teacher and a room are never in two places at once;
// - a teacher's weekly unavailability, most periods a day, most periods a week (the load norm) and most periods in a row;
// - a room must seat the class (or batch) and be of the right kind (a lab for practicals);
// - a lab is a block of consecutive periods on one day that does not cross a break, in one lab, with one teacher;
// - lab batches of a class may run at the same time in different labs with different teachers;
// - a combined class meets once for all its classes, in a room that seats them all;
// - the subjects of an elective basket run in parallel for every class of the programme's term, each option with its
//   own teacher and room;
// - a subject meets at most `maxPerDay` times a day and is spread across the week.

export interface SolverPeriod {
  startsAt: string;
  endsAt: string;
}

export interface SolverRoom {
  id: string;
  name: string;
  kind: string;
  capacity: number | null;
}

export interface SolverTeacher {
  id: string;
  name: string;
  /** Most periods a week (the load norm, less what they teach outside this run). */
  maxPerWeek: number;
  maxPerDay: number;
  maxConsecutive: number;
}

export interface Busy {
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

/** A class taking part: its students and lab batches (by name, with their size). */
export interface SolverSection {
  id: string;
  name: string;
  size: number;
  batches: { name: string; size: number }[];
}

/** One option of an elective basket: the subject, who teaches it, how many chose it. */
export interface ElectiveOption {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  size: number;
  roomId?: string | null;
}

export type Lesson =
  | { kind: 'theory' | 'tutorial'; key: string; label: string; sectionIds: string[]; subjectId: string; teacherId: string; perWeek: number; maxPerDay: number; roomId?: string | null; batch?: string | null }
  | { kind: 'lab'; key: string; label: string; sectionIds: [string]; subjectId: string; teacherId: string; perWeek: number; length: number; batch: string | null; roomId?: string | null }
  | { kind: 'elective'; key: string; label: string; basketId: string; sectionIds: string[]; perWeek: number; options: ElectiveOption[] };

export interface Fixed {
  sectionId: string;
  combinedSectionIds?: string[] | null;
  batch: string | null;
  teacherId: string;
  roomId: string | null;
  subjectId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

export interface SolverInput {
  days: number[];
  /** The class periods of a day in order; `breakAfter[i]` is true when a break follows period i. */
  periods: SolverPeriod[];
  breakAfter?: boolean[];
  sections: SolverSection[];
  rooms: SolverRoom[];
  teachers: SolverTeacher[];
  lessons: Lesson[];
  /** Teachers' and rooms' periods outside this run (other classes' live periods). */
  teacherBusy: Map<string, Busy[]>;
  roomBusy: Map<string, Busy[]>;
  /** When each teacher cannot be timetabled. */
  unavailable: Map<string, Busy[]>;
  /** Periods of these classes that stay where they are (locked). */
  fixed: Fixed[];
}

export interface Placement {
  lessonKey: string;
  kind: 'theory' | 'tutorial' | 'lab' | 'elective';
  sectionId: string;
  combinedSectionIds: string[] | null;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  batch: string | null;
  basketId: string | null;
  blockId: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

export type UnplacedReason = 'teacher_unavailable' | 'teacher_load' | 'no_room' | 'class_full' | 'no_consecutive' | 'subject_daily_limit';

export interface Unplaced {
  lessonKey: string;
  label: string;
  sectionId: string | null;
  missing: number;
  reason: UnplacedReason;
}

export interface SolverResult {
  placements: Placement[];
  unplaced: Unplaced[];
  teachers: { teacherId: string; name: string; periods: number; limit: number; maxDay: number }[];
}

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;
const ROOM_KINDS_FOR_THEORY = new Set(['classroom', 'hall', 'seminar_hall', 'auditorium']);

/** What a class is doing in a period: the whole class, or some of its batches. */
type Occupancy = 'all' | Set<string>;

class Grid {
  /** key `${owner}|${day}|${periodIndex}` */
  private teacher = new Map<string, number>();
  private room = new Set<string>();
  /** Periods a teacher teaches (not merely unavailable), for the consecutive-periods limit. */
  private teaching = new Set<string>();
  private section = new Map<string, Occupancy>();
  private subjectDay = new Map<string, number>();
  readonly teacherWeek = new Map<string, number>();
  readonly teacherDay = new Map<string, number>();
  readonly sectionDay = new Map<string, number>();

  constructor(private readonly periods: SolverPeriod[]) {}

  /** The periods of the day a busy interval touches. */
  indexesOf(b: { startsAt: string; endsAt: string }): number[] {
    return this.periods.map((p, i) => (overlaps(p, b) ? i : -1)).filter((i) => i >= 0);
  }

  teacherFree(t: string, d: number, i: number) {
    return !this.teacher.has(`${t}|${d}|${i}`);
  }
  roomFree(r: string, d: number, i: number) {
    return !this.room.has(`${r}|${d}|${i}`);
  }
  /** A whole-class lesson needs the class free; a batch lesson needs the whole class and that batch free. */
  sectionFree(s: string, d: number, i: number, batch: string | null) {
    const o = this.section.get(`${s}|${d}|${i}`);
    if (!o) return true;
    if (o === 'all' || batch === null) return false;
    return !o.has(batch);
  }
  /** Whether other batches of the class meet in this period (so a batch lab can run alongside them). */
  otherBatches(s: string, d: number, i: number) {
    const o = this.section.get(`${s}|${d}|${i}`);
    return o instanceof Set && o.size > 0;
  }
  subjectCount(s: string, subj: string, d: number) {
    return this.subjectDay.get(`${s}|${subj}|${d}`) ?? 0;
  }

  blockTeacher(t: string, d: number, i: number, count = true) {
    this.teacher.set(`${t}|${d}|${i}`, 1);
    if (count) {
      this.teaching.add(`${t}|${d}|${i}`);
      this.teacherWeek.set(t, (this.teacherWeek.get(t) ?? 0) + 1);
      this.teacherDay.set(`${t}|${d}`, (this.teacherDay.get(`${t}|${d}`) ?? 0) + 1);
    }
  }
  blockRoom(r: string, d: number, i: number) {
    this.room.add(`${r}|${d}|${i}`);
  }
  blockSection(s: string, d: number, i: number, batch: string | null, subj: string | null, countDay = true) {
    const k = `${s}|${d}|${i}`;
    const o = this.section.get(k);
    if (batch === null) this.section.set(k, 'all');
    else if (o !== 'all') this.section.set(k, new Set([...(o ?? []), batch]));
    if (countDay && (batch === null || !o)) this.sectionDay.set(`${s}|${d}`, (this.sectionDay.get(`${s}|${d}`) ?? 0) + 1);
    if (subj) this.subjectDay.set(`${s}|${subj}|${d}`, (this.subjectDay.get(`${s}|${subj}|${d}`) ?? 0) + 1);
  }
  /** The longest run of consecutive teaching periods the teacher would have on the day if also given `extra`. */
  runWith(t: string, d: number, extra: number[], n: number) {
    let best = 0;
    let cur = 0;
    for (let i = 0; i < n; i++) {
      if (this.teaching.has(`${t}|${d}|${i}`) || extra.includes(i)) best = Math.max(best, ++cur);
      else cur = 0;
    }
    return best;
  }
}

/** Fills the week. Lessons that need the most at once go first: electives, then labs, then combined, then the rest. */
export function solve(input: SolverInput): SolverResult {
  const n = input.periods.length;
  const grid = new Grid(input.periods);
  const teachers = new Map(input.teachers.map((t) => [t.id, t]));
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  const breakAfter = input.breakAfter ?? input.periods.map(() => false);
  const placements: Placement[] = [];
  const unplaced: Unplaced[] = [];
  let blockSeq = 0;

  // What is already taken: other classes' periods, unavailability (does not count against the load) and locked periods.
  for (const [t, list] of input.teacherBusy) for (const b of list) for (const i of grid.indexesOf(b)) grid.blockTeacher(t, b.dayOfWeek, i);
  for (const [t, list] of input.unavailable) for (const b of list) for (const i of grid.indexesOf(b)) if (grid.teacherFree(t, b.dayOfWeek, i)) grid.blockTeacher(t, b.dayOfWeek, i, false);
  for (const [r, list] of input.roomBusy) for (const b of list) for (const i of grid.indexesOf(b)) grid.blockRoom(r, b.dayOfWeek, i);
  const unavailableAt = (t: string, d: number, i: number) => (input.unavailable.get(t) ?? []).some((b) => b.dayOfWeek === d && overlaps(b, input.periods[i]));
  for (const f of input.fixed) {
    for (const i of grid.indexesOf(f)) {
      for (const s of [f.sectionId, ...(f.combinedSectionIds ?? [])]) grid.blockSection(s, f.dayOfWeek, i, f.batch, f.sectionId === s ? f.subjectId : null);
      if (grid.teacherFree(f.teacherId, f.dayOfWeek, i)) grid.blockTeacher(f.teacherId, f.dayOfWeek, i);
      if (f.roomId) grid.blockRoom(f.roomId, f.dayOfWeek, i);
    }
  }

  const sizeOf = (sectionIds: string[], batch: string | null) =>
    sectionIds.reduce((sum, id) => {
      const s = sections.get(id);
      if (!s) return sum;
      return sum + (batch ? (s.batches.find((b) => b.name === batch)?.size ?? Math.ceil(s.size / Math.max(1, s.batches.length))) : s.size);
    }, 0);

  /** The smallest free room of the right kind that seats `size` for every period in `idx`, else null. */
  const pickRoom = (kinds: (k: string) => boolean, size: number, d: number, idx: number[], prefer: string | null | undefined, taken: Set<string>): string | null | undefined => {
    const fits = (r: SolverRoom) => kinds(r.kind) && (r.capacity == null || r.capacity >= size) && !taken.has(r.id) && idx.every((i) => grid.roomFree(r.id, d, i));
    if (prefer) {
      const r = input.rooms.find((x) => x.id === prefer);
      return r && (r.capacity == null || r.capacity >= size) && !taken.has(r.id) && idx.every((i) => grid.roomFree(r.id, d, i)) ? r.id : undefined;
    }
    const candidates = input.rooms.filter((r) => kinds(r.kind));
    // An institution that has not set up rooms of this kind gets periods without a room, rather than none at all.
    if (candidates.length === 0) return null;
    const free = candidates.filter(fits).sort((a, b) => (a.capacity ?? 1e6) - (b.capacity ?? 1e6) || a.name.localeCompare(b.name));
    return free[0]?.id;
  };

  const teacherOk = (t: string, d: number, idx: number[]): UnplacedReason | null => {
    const lim = teachers.get(t);
    if (idx.some((i) => !grid.teacherFree(t, d, i))) return idx.some((i) => unavailableAt(t, d, i)) ? 'teacher_unavailable' : 'class_full';
    if (!lim) return null;
    if ((grid.teacherWeek.get(t) ?? 0) + idx.length > lim.maxPerWeek) return 'teacher_load';
    if ((grid.teacherDay.get(`${t}|${d}`) ?? 0) + idx.length > lim.maxPerDay) return 'teacher_load';
    if (grid.runWith(t, d, idx, n) > Math.max(lim.maxConsecutive, idx.length)) return 'teacher_load';
    return null;
  };

  /** Lower is better: spread a subject over the week, balance the class's days, keep teachers' days even, prefer earlier. */
  const score = (sectionIds: string[], subjectIds: string[], teacherIds: string[], d: number, i: number, lab: boolean) => {
    let s = 0;
    for (const sec of sectionIds) {
      for (const subj of subjectIds) s += grid.subjectCount(sec, subj, d) * 100;
      s += (grid.sectionDay.get(`${sec}|${d}`) ?? 0) * 6;
    }
    for (const t of teacherIds) s += (grid.teacherDay.get(`${t}|${d}`) ?? 0) * 3;
    // Labs suit the afternoon; theory the morning.
    s += lab ? (n - i) * 0.5 : i * 0.5;
    return s;
  };

  /** `countAs` is what the period counts towards in the class's daily limit (null: nothing, e.g. a lab block's later periods). */
  const place = (p: Omit<Placement, 'startsAt' | 'endsAt'>, i: number, countAs: string | null = p.subjectId) => {
    const per = input.periods[i];
    placements.push({ ...p, startsAt: per.startsAt, endsAt: per.endsAt });
    for (const s of [p.sectionId, ...(p.combinedSectionIds ?? [])]) grid.blockSection(s, p.dayOfWeek, i, p.batch, s === p.sectionId ? countAs : null);
    grid.blockTeacher(p.teacherId, p.dayOfWeek, i);
    if (p.roomId) grid.blockRoom(p.roomId, p.dayOfWeek, i);
  };

  const order = (l: Lesson) => (l.kind === 'elective' ? 0 : l.kind === 'lab' ? 1 : l.sectionIds.length > 1 ? 2 : 3);
  const lessons = [...input.lessons].sort((a, b) => order(a) - order(b) || (b.kind === 'lab' ? b.length : 1) - (a.kind === 'lab' ? a.length : 1) || b.perWeek - a.perWeek || a.label.localeCompare(b.label));

  for (const l of lessons) {
    let missing = 0;
    let lastReason: UnplacedReason = 'class_full';
    // Options of one basket taught by the same teacher cannot run in parallel.
    if (l.kind === 'elective' && new Set(l.options.map((o) => o.teacherId)).size !== l.options.length) {
      unplaced.push({ lessonKey: l.key, label: l.label, sectionId: null, missing: l.perWeek, reason: 'teacher_load' });
      continue;
    }
    for (let k = 0; k < l.perWeek; k++) {
      type Cand = { d: number; i: number; s: number; rooms: (string | null)[] };
      let best: Cand | null = null;
      for (const d of input.days) {
        if (l.kind === 'lab') {
          for (let i = 0; i + l.length <= n; i++) {
            const idx = Array.from({ length: l.length }, (_, j) => i + j);
            // A block does not cross a break.
            if (idx.slice(0, -1).some((j) => breakAfter[j])) {
              lastReason = lastReason === 'class_full' ? 'no_consecutive' : lastReason;
              continue;
            }
            const sec = l.sectionIds[0];
            // One block of a lab a day for the class (or for each batch).
            if (grid.subjectCount(sec, labKey(l), d) > 0) {
              lastReason = 'subject_daily_limit';
              continue;
            }
            if (!idx.every((j) => grid.sectionFree(sec, d, j, l.batch))) continue;
            const why = teacherOk(l.teacherId, d, idx);
            if (why) {
              lastReason = why;
              continue;
            }
            const room = pickRoom((kind) => kind === 'lab', sizeOf(l.sectionIds, l.batch), d, idx, l.roomId, new Set());
            if (room === undefined) {
              lastReason = 'no_room';
              continue;
            }
            // Batches of a class are best in the lab at the same time, so the rest of the class is not left idle.
            const together = l.batch ? idx.filter((j) => grid.otherBatches(sec, d, j)).length * 60 : 0;
            const s = score(l.sectionIds, [l.subjectId], [l.teacherId], d, i, true) - together;
            if (!best || s < best.s) best = { d, i, s, rooms: [room] };
          }
        } else if (l.kind === 'elective') {
          for (let i = 0; i < n; i++) {
            if (!l.sectionIds.every((s) => grid.sectionFree(s, d, i, null))) continue;
            if (l.sectionIds.some((s) => grid.subjectCount(s, l.basketId, d) > 0)) {
              lastReason = 'subject_daily_limit';
              continue;
            }
            const why = l.options.map((o) => teacherOk(o.teacherId, d, [i])).find(Boolean);
            if (why) {
              lastReason = why;
              continue;
            }
            // Each option needs its own room.
            const taken = new Set<string>();
            const rooms: (string | null)[] = [];
            let ok = true;
            for (const o of l.options) {
              const r = pickRoom((kind) => ROOM_KINDS_FOR_THEORY.has(kind), o.size, d, [i], o.roomId, taken);
              if (r === undefined) {
                ok = false;
                break;
              }
              if (r) taken.add(r);
              rooms.push(r);
            }
            if (!ok) {
              lastReason = 'no_room';
              continue;
            }
            const s = score(l.sectionIds, [l.basketId], l.options.map((o) => o.teacherId), d, i, false);
            if (!best || s < best.s) best = { d, i, s, rooms };
          }
        } else {
          for (let i = 0; i < n; i++) {
            const batch = l.batch ?? null;
            if (!l.sectionIds.every((s) => grid.sectionFree(s, d, i, batch))) continue;
            if (grid.subjectCount(l.sectionIds[0], l.subjectId, d) >= l.maxPerDay) {
              lastReason = 'subject_daily_limit';
              continue;
            }
            const why = teacherOk(l.teacherId, d, [i]);
            if (why) {
              lastReason = why;
              continue;
            }
            const room = pickRoom((kind) => ROOM_KINDS_FOR_THEORY.has(kind), sizeOf(l.sectionIds, batch), d, [i], l.roomId, new Set());
            if (room === undefined) {
              lastReason = 'no_room';
              continue;
            }
            const s = score(l.sectionIds, [l.subjectId], [l.teacherId], d, i, false);
            if (!best || s < best.s) best = { d, i, s, rooms: [room] };
          }
        }
      }
      if (!best) {
        missing++;
        continue;
      }
      if (l.kind === 'lab') {
        const blockId = `block-${++blockSeq}`;
        // The block counts once towards the lab's daily limit.
        for (let j = 0; j < l.length; j++) place({ lessonKey: l.key, kind: 'lab', sectionId: l.sectionIds[0], combinedSectionIds: null, subjectId: l.subjectId, teacherId: l.teacherId, roomId: best.rooms[0], batch: l.batch, basketId: null, blockId, dayOfWeek: best.d }, best.i + j, j === 0 ? labKey(l) : null);
      } else if (l.kind === 'elective') {
        const idx = best.i;
        // The option's period belongs to the first class; the others are combined into it, so every class is held. The
        // basket, not each option, counts once a day for each class.
        l.options.forEach((o, j) => {
          place({ lessonKey: l.key, kind: 'elective', sectionId: l.sectionIds[0], combinedSectionIds: l.sectionIds.length > 1 ? l.sectionIds.slice(1) : null, subjectId: o.subjectId, teacherId: o.teacherId, roomId: best!.rooms[j] ?? null, batch: null, basketId: l.basketId, blockId: null, dayOfWeek: best!.d }, idx, null);
        });
        for (const s of l.sectionIds) grid.blockSection(s, best.d, idx, null, l.basketId, false);
      } else {
        place({ lessonKey: l.key, kind: l.kind, sectionId: l.sectionIds[0], combinedSectionIds: l.sectionIds.length > 1 ? l.sectionIds.slice(1) : null, subjectId: l.subjectId, teacherId: l.teacherId, roomId: best.rooms[0], batch: l.batch ?? null, basketId: null, blockId: null, dayOfWeek: best.d }, best.i);
      }
    }
    if (missing) unplaced.push({ lessonKey: l.key, label: l.label, sectionId: l.sectionIds.length === 1 ? l.sectionIds[0] : null, missing, reason: lastReason });
  }

  const teacherRows = input.teachers.map((t) => {
    const mine = placements.filter((p) => p.teacherId === t.id);
    const byDay = input.days.map((d) => new Set(mine.filter((p) => p.dayOfWeek === d).map((p) => p.startsAt)).size);
    return { teacherId: t.id, name: t.name, periods: new Set(mine.map((p) => `${p.dayOfWeek}|${p.startsAt}`)).size, limit: t.maxPerWeek, maxDay: Math.max(0, ...byDay) };
  });
  return { placements, unplaced, teachers: teacherRows.filter((r) => r.periods > 0) };
}

/** The class periods of a bell schedule in order, with where breaks fall. */
export function bellToPeriods(bell: { startsAt: string; endsAt: string; kind: 'class' | 'break' }[]): { periods: SolverPeriod[]; breakAfter: boolean[] } {
  const sorted = [...bell].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const periods: SolverPeriod[] = [];
  const breakAfter: boolean[] = [];
  for (const b of sorted) {
    if (b.kind === 'break') {
      if (breakAfter.length) breakAfter[breakAfter.length - 1] = true;
      continue;
    }
    // A gap between two periods (longer than five minutes) is a break too.
    if (periods.length) {
      const prev = periods[periods.length - 1];
      if (minutes(b.startsAt) - minutes(prev.endsAt) > 5) breakAfter[breakAfter.length - 1] = true;
    }
    periods.push({ startsAt: b.startsAt.slice(0, 5), endsAt: b.endsAt.slice(0, 5) });
    breakAfter.push(false);
  }
  return { periods, breakAfter };
}

const labKey = (l: { subjectId: string; batch: string | null }) => (l.batch ? `${l.subjectId}#${l.batch}` : l.subjectId);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
