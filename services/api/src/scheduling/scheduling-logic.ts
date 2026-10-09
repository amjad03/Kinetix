// Pure rules for the scheduling desk: term presets, the timetable generator and attendance roll-ups.

export const TERM_PRESETS = {
  semester: { count: 2, label: 'Semester' },
  trimester: { count: 3, label: 'Trimester' },
  quarter: { count: 4, label: 'Quarter' },
  annual: { count: 1, label: 'Annual' },
} as const;
export type TermPreset = keyof typeof TERM_PRESETS;

const MS_DAY = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / MS_DAY;
const fromDay = (d: number) => new Date(d * MS_DAY).toISOString().slice(0, 10);

/** Cuts an academic year into equal, consecutive terms: "Trimester 1" to "Trimester 3" with no gap or overlap. */
export function splitYear(startsOn: string, endsOn: string, preset: TermPreset): { name: string; startsOn: string; endsOn: string }[] {
  const { count, label } = TERM_PRESETS[preset];
  const first = toDay(startsOn);
  const total = toDay(endsOn) - first + 1;
  if (!(total >= count * 7)) throw new RangeError('The year is too short for this preset');
  return Array.from({ length: count }, (_, i) => ({
    name: count === 1 ? label : `${label} ${i + 1}`,
    startsOn: fromDay(first + Math.floor((i * total) / count)),
    endsOn: fromDay(first + Math.floor(((i + 1) * total) / count) - 1),
  }));
}

export interface Period {
  startsAt: string;
  endsAt: string;
}
export interface Demand {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  roomId?: string | null;
  perWeek: number;
  maxPerDay: number;
}
export interface Busy {
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}
export interface Placement {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  roomId: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * Fills a class's week without a clash. Subjects with the most periods go first; each period of a subject goes to
 * the day where that subject has the fewest periods (so a subject is spread across the week), then the day with the
 * fewest periods overall, then the earliest free slot. A teacher or room already busy elsewhere is skipped.
 * Deterministic: the same input gives the same timetable.
 */
export function generateTimetable(input: {
  days: number[];
  periods: Period[];
  demands: Demand[];
  teacherBusy: Map<string, Busy[]>;
  roomBusy: Map<string, Busy[]>;
  /** Periods the class already has and keeps. */
  sectionBusy: Busy[];
}): { placements: Placement[]; unplaced: { subjectId: string; subjectName: string; missing: number }[] } {
  const placements: Placement[] = [];
  const unplaced: { subjectId: string; subjectName: string; missing: number }[] = [];
  const takenBySection: Busy[] = [...input.sectionBusy];
  const loadOfDay = new Map<number, number>(input.days.map((d) => [d, input.sectionBusy.filter((b) => b.dayOfWeek === d).length]));
  const demands = [...input.demands].sort((a, b) => b.perWeek - a.perWeek || a.subjectName.localeCompare(b.subjectName));
  for (const d of demands) {
    let missing = 0;
    const perDay = new Map<number, number>();
    for (let k = 0; k < d.perWeek; k++) {
      const days = [...input.days].sort((x, y) => (perDay.get(x) ?? 0) - (perDay.get(y) ?? 0) || (loadOfDay.get(x) ?? 0) - (loadOfDay.get(y) ?? 0) || x - y);
      let done = false;
      for (const day of days) {
        if ((perDay.get(day) ?? 0) >= d.maxPerDay) continue;
        for (const pe of input.periods) {
          const cell: Busy = { dayOfWeek: day, startsAt: pe.startsAt, endsAt: pe.endsAt };
          const clash = (list: Busy[] | undefined) => (list ?? []).some((b) => b.dayOfWeek === day && overlaps(b, cell));
          if (takenBySection.some((b) => b.dayOfWeek === day && overlaps(b, cell)) || clash(input.teacherBusy.get(d.teacherId)) || (d.roomId && clash(input.roomBusy.get(d.roomId)))) continue;
          placements.push({ subjectId: d.subjectId, subjectName: d.subjectName, teacherId: d.teacherId, roomId: d.roomId ?? null, dayOfWeek: day, startsAt: pe.startsAt, endsAt: pe.endsAt });
          takenBySection.push(cell);
          input.teacherBusy.set(d.teacherId, [...(input.teacherBusy.get(d.teacherId) ?? []), cell]);
          if (d.roomId) input.roomBusy.set(d.roomId, [...(input.roomBusy.get(d.roomId) ?? []), cell]);
          perDay.set(day, (perDay.get(day) ?? 0) + 1);
          loadOfDay.set(day, (loadOfDay.get(day) ?? 0) + 1);
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done) missing++;
    }
    if (missing) unplaced.push({ subjectId: d.subjectId, subjectName: d.subjectName, missing });
  }
  return { placements, unplaced };
}

export interface FrequencyRule {
  minPerWeek: number;
  maxPerWeek: number;
  maxPerDay: number;
}

/** Why adding one more period of a subject would break its frequency rule, or null. */
export function frequencyProblem(rule: FrequencyRule | undefined, weekCount: number, dayCount: number): string | null {
  if (!rule) return null;
  if (weekCount + 1 > rule.maxPerWeek) return `This subject already has ${weekCount} periods a week; the limit is ${rule.maxPerWeek}`;
  if (dayCount + 1 > rule.maxPerDay) return `This subject already has ${dayCount} periods that day; the limit is ${rule.maxPerDay}`;
  return null;
}

/** Where a class's weekly count of a subject stands against its rule. */
export function frequencyStatus(rule: FrequencyRule, weekCount: number): 'under' | 'ok' | 'over' {
  return weekCount < rule.minPerWeek ? 'under' : weekCount > rule.maxPerWeek ? 'over' : 'ok';
}

export interface AttendanceCell {
  key: string;
  label: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  pct: number | null;
}

/** Folds attendance rows into groups: present and late count as attended, excused is left out of the percentage. */
export function rollUp(rows: { key: string; label: string; status: 'present' | 'absent' | 'late' | 'excused'; n?: number }[]): AttendanceCell[] {
  const map = new Map<string, AttendanceCell>();
  for (const r of rows) {
    const c = map.get(r.key) ?? { key: r.key, label: r.label, present: 0, late: 0, absent: 0, excused: 0, total: 0, pct: null };
    const n = r.n ?? 1;
    c[r.status] += n;
    c.total += n;
    map.set(r.key, c);
  }
  return [...map.values()].map((c) => {
    const counted = c.present + c.late + c.absent;
    return { ...c, pct: counted ? Math.round(((c.present + c.late) / counted) * 1000) / 10 : null };
  });
}

/** Whether a punch time counts as late: after the cut-off (HH:MM). */
export const isLatePunch = (inTime: string, lateAfter: string) => inTime.slice(0, 5) > lateAfter;
