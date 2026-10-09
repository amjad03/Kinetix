/** Attendance, internal assessments, homework, the LMS and lesson plans for the running semester. */
import type { Ctx, SectionRef } from './ctx.js';
import { addDays, at, J, weekday } from './kit.js';

interface Slot {
  id: string;
  sectionId: string;
  dayOfWeek: number;
  startsAt: string;
  subjectId: string;
  teacherId: string;
}

/** Sections whose internal assessments are created with the exam session (they feed its results). */
export const EXAM_SECTIONS = new Set(['BCM:3', 'BBA:3', 'BCA:3']);

export async function attendance(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const slots = await k.q<Slot>('select id, section_id, day_of_week, to_char(starts_at, \'HH24:MI\') as starts_at, subject_id, teacher_id from timetable_slots where tenant_id = $1', [c.tenantId]);
  const leaveDays = new Map<string, Set<string>>();
  // A few approved student leaves: those days count as excused.
  const leaves: Record<string, unknown>[] = [];
  for (const st of c.students.filter((_, i) => i % 23 === 5)) {
    const from = c.workingDays[r.int(5, c.workingDays.length - 6)];
    leaves.push({ studentId: st.id, fromDate: from, toDate: addDays(from, 1), reason: r.pick(['Fever and rest advised by the doctor', 'Family function at native place', 'Sister’s wedding', 'Visa appointment in Chennai', 'Medical check-up']), status: 'approved', requestedBy: st.userId ?? c.guardianOf.get(st.id)?.[0] ?? c.byEmail.principal.id, decidedBy: c.byEmail['hod.commerce'].id, decisionNote: 'Approved', decidedAt: at(addDays(from, -1), '12:00') });
    leaveDays.set(st.id, new Set([from, addDays(from, 1)]));
  }
  const open = c.students.filter((_, i) => i % 41 === 7).map((st) => ({ studentId: st.id, fromDate: addDays(c.today, 1), toDate: addDays(c.today, 2), reason: 'Participating in an inter-collegiate fest', status: 'pending', requestedBy: c.byEmail.principal.id }));
  await k.ins('student_leave_requests', [...leaves, ...open], { returning: false });

  const rows: Record<string, unknown>[] = [];
  for (const sec of c.sections) {
    const secSlots = slots.filter((x) => x.sectionId === sec.id);
    for (const day of c.workingDays) {
      const todays = secSlots.filter((x) => x.dayOfWeek === weekday(day));
      if (!todays.length) continue;
      for (const st of sec.students) {
        const away = !r.chance(st.presence) || leaveDays.get(st.id)?.has(day);
        const excused = leaveDays.get(st.id)?.has(day);
        for (const sl of todays) {
          let status = 'present';
          if (away) status = excused ? 'excused' : 'absent';
          else if (r.chance(0.012)) status = 'absent';
          else if (r.chance(0.02)) status = 'late';
          rows.push({ studentId: st.id, sectionId: sec.id, date: day, timetableSlotId: sl.id, status, markedBy: sl.teacherId, occurredAt: at(day, sl.startsAt) });
        }
      }
    }
  }
  await k.ins('attendance_records', rows, { returning: false });
}

export async function assessmentsAndHomework(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const iaDay = '2026-09-22';
  for (const sec of c.sections) {
    const examSec = EXAM_SECTIONS.has(`${sec.prog}:${sec.term}`);
    const asm: { sub: (typeof sec.subjects)[number]; title: string; kind: string; max: number; held: string }[] = [];
    for (const sub of sec.subjects) {
      if (!examSec) {
        asm.push({ sub, title: `Internal Assessment 1: ${sub.name}`, kind: 'internal', max: 20, held: addDays(iaDay, r.int(0, 4)) });
        asm.push({ sub, title: `Assignment: ${sub.name}`, kind: 'assignment', max: 10, held: addDays(iaDay, -14) });
      }
    }
    if (!asm.length) continue;
    const rows = await k.ins<{ id: string }>(
      'assessments',
      asm.map((a) => ({ sectionId: sec.id, subjectId: a.sub.id, title: a.title, kind: a.kind, maxMarks: a.max, heldOn: a.held, publishedAt: at(addDays(a.held, 5)), createdBy: a.sub.teacherId, markStatus: 'verified', submittedAt: at(addDays(a.held, 3)), verifiedBy: c.byEmail[sec.def.dept === 'Commerce' ? 'hod.commerce' : 'hod.management'].id, verifiedAt: at(addDays(a.held, 4)) })),
    );
    const marks: Record<string, unknown>[] = [];
    rows.forEach((row, i) => {
      for (const st of sec.students) {
        if (st.presence < 0.7 && r.chance(0.3)) marks.push({ assessmentId: row.id, studentId: st.id, marks: null, absent: true });
        else marks.push({ assessmentId: row.id, studentId: st.id, marks: Math.round(Math.min(1, Math.max(0.1, r.gauss(st.ability * 0.85 + 0.12, 0.09))) * asm[i].max * 2) / 2, absent: false });
      }
    });
    await k.ins('marks', marks, { returning: false });
  }

  // Homework: three per class, with submissions.
  for (const sec of c.sections) {
    const subs = sec.subjects.slice(0, 3);
    const hw = await k.ins<{ id: string; dueOn: string }>(
      'homework',
      subs.map((s, i) => ({ sectionId: sec.id, subjectId: s.id, createdBy: s.teacherId, title: [`Case study: ${s.name}`, `Unit 2 problems: ${s.name}`, `Reading and summary: ${s.name}`][i], instructions: 'Complete and submit on the app before the due date. Write in your own words; copied answers get no marks.', dueOn: addDays(c.today, [-6, 3, 8][i]) })),
    );
    const subsRows: Record<string, unknown>[] = [];
    hw.forEach((h, i) => {
      if (i > 0) return;
      for (const st of sec.students) {
        if (!r.chance(0.5 + st.ability * 0.4)) continue;
        const checked = r.chance(0.7);
        subsRows.push({ homeworkId: h.id, studentId: st.id, text: 'Submitted: please find my answers attached with the working notes.', status: checked ? 'checked' : 'submitted', submittedBy: st.userId ?? sec.subjects[0].teacherId, submittedAt: at(addDays(h.dueOn, -r.int(0, 2)), '17:30'), remark: checked ? r.pick(['Good analysis.', 'Add more examples.', 'Well presented.', 'Needs more depth in the conclusion.']) : null, checkedBy: checked ? subs[i].teacherId : null, checkedAt: checked ? at(addDays(h.dueOn, 1)) : null });
      }
    });
    await k.ins('homework_submissions', subsRows, { returning: false });
  }
}

export async function lms(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  for (const sec of c.sections) {
    for (const sub of sec.subjects.slice(0, 2)) {
      const course = await k.one<{ id: string }>('lms_courses', { sectionId: sec.id, subjectId: sub.id, title: `${sub.name} (${sec.label})`, description: `Course space for ${sub.name}: notes, readings, recorded lectures and assignments for this semester.`, status: 'published', createdBy: sub.teacherId });
      const modules = await k.ins<{ id: string }>('lms_modules', ['Unit 1: Foundations', 'Unit 2: Core concepts', 'Unit 3: Applications and cases'].map((title, position) => ({ courseId: course.id, title, position })));
      const items: Record<string, unknown>[] = [];
      modules.forEach((m, mi) => {
        items.push(
          { moduleId: m.id, position: 0, kind: 'file', title: `Unit ${mi + 1} lecture notes (PDF)`, url: `https://learn.${'soundarya.demo.kinetix.in'}/files/${sub.code.toLowerCase()}-unit${mi + 1}.pdf` },
          { moduleId: m.id, position: 1, kind: 'video', title: `Unit ${mi + 1} recorded lecture`, url: `https://learn.soundarya.demo.kinetix.in/video/${sub.code.toLowerCase()}-u${mi + 1}` },
          { moduleId: m.id, position: 2, kind: 'link', title: 'Further reading', url: 'https://www.ugc.gov.in/' },
        );
      });
      await k.ins('lms_items', items, { returning: false });
      await k.ins('lms_announcements', [{ courseId: course.id, title: 'Welcome to the course', body: 'Unit notes are uploaded weekly. Attend every class and submit assignments on time. Internal marks include attendance.', createdBy: sub.teacherId }, { courseId: course.id, title: 'Internal Assessment 1 schedule', body: 'IA 1 is in the week of 21 September. Syllabus: Units 1 and 2.', createdBy: sub.teacherId }], { returning: false });
      await k.ins('lms_grade_categories', [{ courseId: course.id, name: 'Homework', source: 'homework', weight: 20, position: 0 }, { courseId: course.id, name: 'Assignments', source: 'assignment', weight: 20, position: 1 }, { courseId: course.id, name: 'Internal tests', source: 'internal', weight: 60, position: 2 }], { returning: false });
      void r;
    }
  }
}

export async function lessonPlans(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const slots = await k.q<Slot>('select id, section_id, day_of_week, to_char(starts_at, \'HH24:MI\') as starts_at, subject_id, teacher_id from timetable_slots where tenant_id = $1', [c.tenantId]);
  const rows: Record<string, unknown>[] = [];
  const secOf = (id: string): SectionRef => c.sections.find((s) => s.id === id)!;
  for (let d = 1; d <= 6 && rows.length < 14; d++) {
    const date = addDays(c.today, d);
    if (weekday(date) === 7 || c.holidays.has(date)) continue;
    for (const sl of slots.filter((x) => x.dayOfWeek === weekday(date) && x.startsAt === '10:00').slice(0, 3)) {
      const sub = secOf(sl.sectionId).subjects.find((s) => s.id === sl.subjectId)!;
      rows.push({
        sectionId: sl.sectionId, subjectId: sl.subjectId, timetableSlotId: sl.id, date, teacherId: sl.teacherId, topicIds: [],
        content: J({ objectives: [`Explain the key idea of the next unit of ${sub.name}`, 'Work through one case or problem in class'], steps: [{ minutes: 5, activity: 'Recap of the last class' }, { minutes: 25, activity: 'Concept explanation with examples' }, { minutes: 20, activity: 'Case discussion in groups' }, { minutes: 5, activity: 'Exit question' }], materials: ['Textbook', 'Slides'], assessment: 'Exit question', homework: 'Practice set from the unit' }),
        aiDrafted: rows.length % 3 === 0,
      });
    }
  }
  await k.ins('lesson_plans', rows, { returning: false });
}
