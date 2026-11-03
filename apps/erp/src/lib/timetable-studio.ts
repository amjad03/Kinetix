// The timetable studio (services/api/src/timetable-studio): versions, their periods, problems and workload, and the
// client-side clash check the editor runs while a period is dragged.

export type VersionStatus = 'draft' | 'published' | 'superseded' | 'discarded';

export interface VersionRow {
  id: string;
  versionNo: number;
  name: string;
  status: VersionStatus;
  source: string;
  sectionIds: string[];
  classes: string[];
  effectiveFrom: string | null;
  createdAt: string;
  publishedAt: string | null;
  createdBy: string | null;
  periods: number;
  unplaced: number;
}

export interface StudioSlot {
  id: string;
  sectionId: string;
  section: string;
  subjectId: string;
  subject: string;
  subjectCode: string;
  teacherId: string;
  teacher: string;
  roomId: string | null;
  room: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  batch: string | null;
  combinedSectionIds: string[] | null;
  kind: 'theory' | 'tutorial' | 'lab' | 'elective';
  basketId: string | null;
  blockId: string | null;
  locked: boolean;
}

export interface SlotProblem {
  slotId: string | null;
  code: string;
  kind: 'class' | 'teacher' | 'room' | 'unavailable' | 'capacity' | 'room_kind';
  message: string;
  withSlotId?: string | null;
}

export interface Unplaced {
  label: string;
  sectionId: string | null;
  missing: number;
  reason: 'teacher_unavailable' | 'teacher_load' | 'no_room' | 'class_full' | 'no_consecutive' | 'subject_daily_limit' | 'no_teacher';
}

export interface WorkloadRow {
  teacherId: string;
  teacher: string;
  periods: number;
  elsewhere: number;
  total: number;
  limit: number;
  maxDay: number;
  dayLimit: number;
  labPeriods: number;
  status: 'ok' | 'over';
}

export interface VersionDetail extends Omit<VersionRow, 'classes' | 'periods' | 'unplaced' | 'createdBy'> {
  notes: string;
  report: { placed?: number; unplaced?: Unplaced[]; generatedAt?: string };
  settings: { days?: number[]; periods?: { startsAt: string; endsAt: string }[]; combine?: { subjectId: string; sectionIds: string[] }[] };
  classes: { id: string; displayName: string; programId: string; term: number }[];
  days: number[];
  periods: { startsAt: string; endsAt: string }[];
  slots: StudioSlot[];
  problems: SlotProblem[];
  diff: { sectionId: string; section: string; added: number; removed: number; kept: number }[];
  workload: WorkloadRow[];
}

export interface StudioOptions {
  sections: { id: string; displayName: string; programId: string; term: number }[];
  subjects: { id: string; code: string; name: string; programId: string; term: number; courseType: string; lectureHours: number; tutorialHours: number; practicalHours: number }[];
  rooms: { id: string; name: string; kind: string; capacity: number | null }[];
  staff: { id: string; fullName: string }[];
  departments: { id: string; name: string }[];
}

export type ViewBy = 'class' | 'teacher' | 'room';

/** The periods of a version a view shows: a class (and periods combined into it), a teacher, a room. */
export function slotsFor(slots: StudioSlot[], by: ViewBy, id: string): StudioSlot[] {
  return slots.filter((s) => (by === 'class' ? s.sectionId === id || (s.combinedSectionIds ?? []).includes(id) : by === 'teacher' ? s.teacherId === id : s.roomId === id));
}

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * What a period (and the rest of its lab block or elective) would clash with at a new place, checked in the browser
 * while dragging: the class or a combined class (two batches may meet at once, parallel elective options too), the
 * teacher or the room. The API checks again, against the live timetable and unavailability too, when it is dropped.
 */
export function clashesAt(slots: StudioSlot[], moving: StudioSlot, to: { dayOfWeek: number; startsAt: string }): ('class' | 'teacher' | 'room')[] {
  const group = moving.blockId ? slots.filter((s) => s.blockId === moving.blockId) : moving.kind === 'elective' && moving.basketId ? slots.filter((s) => s.basketId === moving.basketId && s.dayOfWeek === moving.dayOfWeek && s.startsAt === moving.startsAt) : [moving];
  const shift = toMin(to.startsAt) - toMin(moving.startsAt);
  const ids = new Set(group.map((g) => g.id));
  const out = new Set<'class' | 'teacher' | 'room'>();
  for (const g of group) {
    const at = { startsAt: fromMin(toMin(g.startsAt) + shift), endsAt: fromMin(toMin(g.endsAt) + shift) };
    const mine = [g.sectionId, ...(g.combinedSectionIds ?? [])];
    for (const s of slots) {
      if (ids.has(s.id) || s.dayOfWeek !== to.dayOfWeek || !overlaps(s, at)) continue;
      const same = [s.sectionId, ...(s.combinedSectionIds ?? [])].some((x) => mine.includes(x));
      const batches = g.batch && s.batch && g.batch !== s.batch;
      if (same && !batches && !(g.kind === 'elective' && s.kind === 'elective')) out.add('class');
      else if (s.teacherId === g.teacherId) out.add('teacher');
      else if (g.roomId && s.roomId === g.roomId) out.add('room');
    }
  }
  return [...out];
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const STATUS_TONE: Record<VersionStatus, 'success' | 'warning' | 'neutral' | 'danger'> = { draft: 'warning', published: 'success', superseded: 'neutral', discarded: 'danger' };
