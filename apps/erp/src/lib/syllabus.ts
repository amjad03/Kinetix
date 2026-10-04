import 'server-only';
import { api } from './api';
import { addDays, isoWeekday } from './dates';
import { schoolToday } from './school';
import type { ClassesDay, CourseOutline, SubjectLink } from './types';

/**
 * The institution's subjects and the course each is linked to.
 *
 * The API has no subjects list yet (`GET /v1/admin/structure` has none), so subjects are
 * gathered from this week's timetable (Monday to Saturday), and each link is read from
 * `GET /v1/content/syllabus?subjectId=`. A subject not on the timetable does not appear.
 */
export async function institutionSubjects(): Promise<SubjectLink[]> {
  const today = schoolToday();
  const monday = addDays(today, 1 - isoWeekday(today));
  const days = await Promise.all([0, 1, 2, 3, 4, 5].map((n) => api<ClassesDay>(`/v1/admin/classes?date=${addDays(monday, n)}`)));
  const byId = new Map<string, SubjectLink>();
  for (const c of days.flatMap((d) => d.classes)) {
    const s = byId.get(c.subject.id) ?? { id: c.subject.id, name: c.subject.name, code: c.subject.code, classes: [], courseId: null };
    if (!s.classes.includes(c.section.displayName)) s.classes.push(c.section.displayName);
    byId.set(c.subject.id, s);
  }
  const subjects = [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  await Promise.all(
    subjects.map(async (s) => {
      const outline = await api<CourseOutline | null>(`/v1/content/syllabus?subjectId=${s.id}`);
      s.courseId = outline?.id ?? null;
      s.classes.sort();
    }),
  );
  return subjects;
}
