/** School-only records (SEED_PROFILE=school): houses and house points, the class diary, and Term 1 report cards. */
import type { Ctx } from './ctx.js';
import { at } from './kit.js';

const grade = (pct: number) => (pct >= 91 ? 'A1' : pct >= 81 ? 'A2' : pct >= 71 ? 'B1' : pct >= 61 ? 'B2' : pct >= 51 ? 'C1' : pct >= 41 ? 'C2' : pct >= 33 ? 'D' : 'E');

export async function schoolLife(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;

  // Houses.
  const houses = await k.ins<{ id: string; name: string }>('houses', [
    { name: 'Ganga', colour: '#1E88E5', motto: 'Flow with purpose' },
    { name: 'Kaveri', colour: '#43A047', motto: 'Nurture and grow' },
    { name: 'Narmada', colour: '#FB8C00', motto: 'Courage in every stride' },
    { name: 'Yamuna', colour: '#E53935', motto: 'Strength in unity' },
  ]);
  const senior = c.students.filter((s) => s.term >= 3);
  await k.ins('house_members', senior.map((s, i) => ({ houseId: houses[i % 4].id, studentId: s.id, isCaptain: false })), { returning: false });
  const captains = houses.map((h, hi) => senior.filter((s, i) => i % 4 === hi && s.term === 12)[0]).filter(Boolean);
  for (const [hi, st] of captains.entries()) await k.q('update house_members set is_captain = true where house_id = $1 and student_id = $2', [houses[hi].id, st.id]);
  const cats: [string, string, number][] = [
    ['sports', 'Inter-house football, first place', 50],
    ['sports', 'Relay race, second place', 30],
    ['cultural', 'Inter-house quiz, winners', 40],
    ['cultural', 'Kannada Rajyotsava skit', 25],
    ['academic', 'Science exhibition model', 20],
    ['discipline', 'Best-kept classroom of the month', 15],
    ['service', 'Eco club tree planting drive', 10],
  ];
  const pts: Record<string, unknown>[] = [];
  for (let i = 0; i < 48; i++) {
    const [category, reason, points] = cats[i % cats.length];
    const st = senior[(i * 37) % senior.length];
    pts.push({ houseId: houses[(i * 3 + (i >> 2)) % 4].id, studentId: i % 3 === 0 ? null : st.id, points: points - (i % 5) * 2, category, reason, awardedOn: c.workingDays[(i * 3) % c.workingDays.length], awardedBy: principal });
  }
  await k.ins('house_points', pts, { returning: false });

  // Class diary: the last ten working days for every class.
  const days = c.workingDays.slice(-10);
  const homework = ['Complete the exercise questions at the end of the chapter.', 'Learn the new words and write two sentences with each.', 'Revise today’s lesson and draw the diagram neatly.', 'Solve the worksheet given in class.', 'Read the next chapter and note three questions.'];
  for (const sec of c.sections) {
    const entries = days.map((d, di) => {
      const sub = sec.subjects[di % sec.subjects.length];
      return {
        sectionId: sec.id,
        subjectId: sub.id,
        entryDate: d,
        classwork: `${sub.name}: lesson ${3 + (di >> 1)} taught with examples and a short class activity.`,
        homeworkNote: homework[(di + sec.term) % homework.length],
        notice: di === days.length - 1 ? 'Parent-Teacher Meeting on Saturday, 10 am to 1 pm. Please book a slot in the parent app.' : di === 4 ? 'Please send a signed consent slip for the field trip.' : null,
        authorId: sub.teacherId,
        createdAt: at(d, '15:30'),
      };
    });
    const rows = await k.ins<{ id: string; entryDate: string }>('diary_entries', entries);
    const acks: Record<string, unknown>[] = [];
    for (const st of sec.students) {
      const g = c.guardianOf.get(st.id)?.[0];
      if (!g) continue;
      rows.forEach((e, ei) => {
        if (ei < rows.length - 1 && (ei + st.rollNo.length) % 4 !== 0) acks.push({ entryId: e.id, studentId: st.id, guardianUserId: g, acknowledgedAt: at(e.entryDate, '20:15') });
      });
    }
    if (acks.length) await k.ins('diary_acks', acks, { returning: false });
  }

  // Term 1 report cards for every student.
  const remarks = ['Excellent progress. Keep it up!', 'Good effort; needs to read more regularly.', 'Attentive in class and helpful to peers.', 'Can do better with consistent practice at home.', 'Shows good curiosity in science activities.'];
  for (const sec of c.sections) {
    const cards = await k.ins<{ id: string; studentId: string }>(
      'report_cards',
      sec.students.map((st, i) => ({
        studentId: st.id,
        academicYearId: c.years.cur,
        termLabel: 'Term 1',
        remarks: remarks[(i + sec.term) % remarks.length],
        behaviourGrade: st.presence > 0.85 ? 'A' : st.presence > 0.72 ? 'B' : 'C',
        promotionStatus: 'pending',
        createdBy: principal,
      })),
    );
    const lines: Record<string, unknown>[] = [];
    const co: Record<string, unknown>[] = [];
    cards.forEach((card, i) => {
      const st = sec.students[i];
      for (const sub of sec.subjects) {
        const pct = Math.round(Math.min(99, Math.max(28, r.gauss(st.ability * 80 + 22, 7))));
        lines.push({ reportCardId: card.id, subjectName: sub.name, marks: pct, maxMarks: 100, grade: grade(pct), remark: pct >= 85 ? 'Very good' : pct < 40 ? 'Needs support' : null });
      }
      for (const [j, activity] of ['Art education', 'Health and physical education', 'Work education', 'Discipline'].entries()) co.push({ reportCardId: card.id, activity, grade: ['A', 'A', 'B', 'A', 'B', 'C'][(i + j + sec.term) % 6], remark: null });
    });
    await k.ins('report_card_lines', lines, { returning: false });
    await k.ins('co_curricular_grades', co, { returning: false });
  }
}
