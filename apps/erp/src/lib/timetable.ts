// The week grid for the timetable editor. Pure.

import type { MessageKey } from '@/i18n/messages';
import type { Structure, TimetableSlot } from './types';

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "09:00:00" → "09:00". */
export const hm = (t: string) => t.slice(0, 5);

export interface GridColumn {
  key: string;
  startsAt: string;
  endsAt: string;
}

export interface WeekGrid {
  columns: GridColumn[];
  rows: { day: number; cells: Record<string, TimetableSlot[]> }[];
}

/**
 * Rows are Monday–Saturday (and Sunday when something is on), columns are the distinct period
 * times in the week, earliest first. Each cell holds the periods at that time that day.
 */
export function weekGrid(slots: TimetableSlot[]): WeekGrid {
  const cols = new Map<string, GridColumn>();
  for (const s of slots) {
    const key = `${hm(s.startsAt)}-${hm(s.endsAt)}`;
    if (!cols.has(key)) cols.set(key, { key, startsAt: hm(s.startsAt), endsAt: hm(s.endsAt) });
  }
  const columns = [...cols.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt));
  const days = [1, 2, 3, 4, 5, 6];
  if (slots.some((s) => s.dayOfWeek === 7)) days.push(7);
  const rows = days.map((day) => {
    const cells: Record<string, TimetableSlot[]> = {};
    for (const s of slots.filter((x) => x.dayOfWeek === day)) (cells[`${hm(s.startsAt)}-${hm(s.endsAt)}`] ??= []).push(s);
    return { day, cells };
  });
  return { columns, rows };
}

export interface SlotInput {
  sectionId: string;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

/** The same checks the API makes on the form, so mistakes are explained before saving (dictionary keys). */
export function slotProblem(s: SlotInput): MessageKey | null {
  if (!s.sectionId) return 'tt.err.class';
  if (!s.subjectId) return 'tt.err.subject';
  if (!s.teacherId) return 'tt.err.teacher';
  if (!Number.isInteger(s.dayOfWeek) || s.dayOfWeek < 1 || s.dayOfWeek > 7) return 'tt.err.day';
  if (!TIME.test(s.startsAt) || !TIME.test(s.endsAt)) return 'tt.err.time';
  if (s.startsAt >= s.endsAt) return 'tt.err.order';
  return null;
}

/** Subjects taught in a class: same program and term. */
export function subjectsFor(structure: Pick<Structure, 'sections' | 'subjects'>, sectionId: string): Structure['subjects'] {
  const section = structure.sections.find((s) => s.id === sectionId);
  if (!section) return [];
  return structure.subjects.filter((s) => s.programId === section.programId && s.term === section.term);
}

/** "HH:MM" plus minutes, clamped to the day. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
