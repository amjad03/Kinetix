/**
 * Academics pass demo data: the college's bell schedule, L-T-P hours on the BCom Sem 3 courses, a Tally lab in two
 * batches and an open elective basket, faculty allocations, teachers' weekly unavailability, the live timetable as
 * version 1 (published) and a generated draft version 2 with labs and parallel electives; the teaching diary for the
 * semester's held periods (topics, delivery, against the lesson plan, the head's review) with a few left to log; and
 * the affiliating university, so the calendar is checked against its working-day minimum.
 */
import { sql } from 'drizzle-orm';
import type { UserPrincipal } from '../../auth/principal.js';
import { StudioService } from '../../timetable-studio/studio.service.js';
import { againstPlan } from '../../teaching-log/teaching-log-rules.js';
import type { Ctx } from './ctx.js';
import { addDays, J, weekday } from './kit.js';
import { service, withTenant } from './nest.js';
import { PERIODS } from './core.js';

const DELIVERIES = ['lecture', 'lecture', 'lecture', 'discussion', 'tutorial', 'demonstration', 'revision'];

export async function academicsPass(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principalId = c.byEmail.principal.id;
  const as = (id: string, roles: UserPrincipal['roles']): UserPrincipal => ({ kind: 'user', tenantId: c.tenantId, userId: id, roles });

  // 1. The affiliating university (its rules check the calendar's working days), unless one is already chosen.
  const [aff] = await k.q<{ id: string }>('select id from affiliation_settings where tenant_id = $1', [c.tenantId]);
  if (!aff) await k.ins('affiliation_settings', { profileCode: 'bangalore-university', schemeCode: 'sep-2024', overrides: {}, updatedBy: principalId }, { returning: false });

  // 2. The college day: five periods, a tea break after the second and lunch after the fourth; Monday to Saturday.
  const bell = [
    ...PERIODS.slice(0, 2).map(([s, e], i) => ({ label: `Period ${i + 1}`, startsAt: s, endsAt: e, kind: 'class' })),
    { label: 'Tea break', startsAt: '10:55', endsAt: '11:15', kind: 'break' },
    ...PERIODS.slice(2, 4).map(([s, e], i) => ({ label: `Period ${i + 3}`, startsAt: s, endsAt: e, kind: 'class' })),
    { label: 'Lunch', startsAt: '13:10', endsAt: '14:00', kind: 'break' },
    { label: 'Period 5', startsAt: PERIODS[4][0], endsAt: PERIODS[4][1], kind: 'class' },
  ];
  const [haveBell] = await k.q<{ id: string }>('select id from period_structures where tenant_id = $1 and is_default', [c.tenantId]);
  if (!haveBell) await k.ins('period_structures', { name: 'College day (Mon-Sat)', days: '{1,2,3,4,5,6}', periods: J(bell), isDefault: true }, { returning: false });

  // 3. BCom Sem 3: contact hours from the credits, a Tally lab course (0-0-2) and an open elective basket.
  const bcom = c.sections.filter((s) => s.prog === 'BCM' && s.term === 3);
  const sec = bcom[0];
  if (!sec) return;
  for (const s of sec.subjects) await k.q('update subjects set lecture_hours = $2, tutorial_hours = $3 where id = $1 and lecture_hours = 0', [s.id, Math.max(2, Math.round(s.credits)), s.credits >= 4 ? 1 : 0]);
  const commerce = c.teachers.filter((t) => t.dept === 'Commerce');
  const lab = await k.one<{ id: string }>('subjects', { programId: sec.programId, term: 3, code: 'BCM3-L1', name: 'Tally Prime and GST lab', courseType: 'lab', credits: 2, practicalHours: 2, departmentId: c.departments['Commerce'] ?? null, sortOrder: 90 });
  const oe = await k.ins<{ id: string; name: string }>('subjects', [
    { programId: sec.programId, term: 3, code: 'BCM3-OE1', name: 'Digital marketing', courseType: 'open_elective', credits: 3, lectureHours: 2, departmentId: c.departments['Commerce'] ?? null, sortOrder: 91 },
    { programId: sec.programId, term: 3, code: 'BCM3-OE2', name: 'Personal financial planning', courseType: 'open_elective', credits: 3, lectureHours: 2, departmentId: c.departments['Commerce'] ?? null, sortOrder: 92 },
  ]);
  const basket = await k.one<{ id: string }>('elective_baskets', { programId: sec.programId, term: 3, name: 'Open elective I', kind: 'open_elective', minChoose: 1, maxChoose: 1, minCredits: 3, maxCredits: 3, notes: 'Runs in the same period for every BCom Sem 3 class' });
  await k.ins('elective_basket_subjects', oe.map((s) => ({ basketId: basket.id, subjectId: s.id })), { returning: false });

  // 4. Lab batches of BCom Sem 3 A (by roll number) and who teaches what.
  const roll = [...sec.students].sort((a, b) => a.rollNo.localeCompare(b.rollNo));
  await k.ins('student_batches', roll.map((s, i) => ({ sectionId: sec.id, studentId: s.id, batch: i < roll.length / 2 ? 'B1' : 'B2' })), { returning: false });
  const allocs: Record<string, unknown>[] = [];
  for (const s of bcom) {
    for (const sub of s.subjects) allocs.push({ academicYearId: c.years.cur, sectionId: s.id, subjectId: sub.id, teacherId: sub.teacherId, role: 'primary', hoursPerWeek: Math.max(2, Math.round(sub.credits)), fromDate: c.semStart });
  }
  const labTeachers = [commerce[2] ?? c.teachers[0], commerce[3] ?? c.teachers[1]];
  allocs.push({ academicYearId: c.years.cur, sectionId: sec.id, subjectId: lab.id, teacherId: labTeachers[0].id, role: 'lab', batch: 'B1', hoursPerWeek: 2, fromDate: c.semStart });
  allocs.push({ academicYearId: c.years.cur, sectionId: sec.id, subjectId: lab.id, teacherId: labTeachers[1].id, role: 'lab', batch: 'B2', hoursPerWeek: 2, fromDate: c.semStart });
  for (const s of bcom.slice(1)) allocs.push({ academicYearId: c.years.cur, sectionId: s.id, subjectId: lab.id, teacherId: labTeachers[0].id, role: 'lab', hoursPerWeek: 2, fromDate: c.semStart });
  oe.forEach((s, i) => allocs.push({ academicYearId: c.years.cur, sectionId: sec.id, subjectId: s.id, teacherId: (commerce[4 + i] ?? c.teachers[5 + i]).id, role: 'primary', hoursPerWeek: 2, fromDate: c.semStart }));
  await k.ins('faculty_allocations', allocs, { returning: false });

  // 5. Weekly unavailability: a research afternoon, a day at the university, a course until December.
  const away = [
    { teacherId: commerce[0]?.id ?? c.teachers[0].id, dayOfWeek: 3, startsAt: '14:00', endsAt: '16:00', reason: 'Research afternoon (PhD guide at Bangalore University)' },
    { teacherId: commerce[1]?.id ?? c.teachers[1].id, dayOfWeek: 6, startsAt: null, endsAt: null, reason: 'Board of Studies and valuation work at the university' },
    { teacherId: c.teachers.find((t) => t.dept !== 'Commerce')?.id ?? c.teachers[2].id, dayOfWeek: 1, startsAt: '09:00', endsAt: '10:55', toDate: '2026-12-19', reason: 'Faculty development programme (UGC-MMTTC), Monday mornings' },
  ];
  await k.ins('faculty_unavailability', away.map((a) => ({ ...a, createdBy: principalId })), { returning: false });

  // 6. Versions: the live timetable of BCom Sem 3 is version 1; version 2 is generated with the lab and the electives.
  const ids = bcom.map((s) => s.id);
  const live = await k.q<{ n: number }>('select count(*)::int as n from timetable_slots where tenant_id = $1 and archived_at is null and section_id = any($2::uuid[])', [c.tenantId, ids]);
  const v1 = await k.one<{ id: string }>('timetable_versions', { academicYearId: c.years.cur, versionNo: 1, name: 'Odd semester 2026: BCom Sem 3', status: 'published', sectionIds: `{${ids.join(',')}}`, source: 'copy', settings: J({}), report: J({ placed: live[0].n }), notes: 'The timetable the semester started with.', effectiveFrom: c.semStart, createdBy: principalId, publishedBy: principalId, publishedAt: new Date(`${c.semStart}T03:30:00Z`) });
  await k.q('insert into timetable_version_slots (tenant_id, version_id, section_id, subject_id, teacher_id, room_id, day_of_week, starts_at, ends_at, batch, combined_section_ids, kind) select tenant_id, $2, section_id, subject_id, teacher_id, room_id, day_of_week, starts_at, ends_at, batch, combined_section_ids, \'theory\' from timetable_slots where tenant_id = $1 and archived_at is null and section_id = any($3::uuid[])', [c.tenantId, v1.id, ids]);
  await k.q('update timetable_slots set version_id = $2 where tenant_id = $1 and archived_at is null and section_id = any($3::uuid[])', [c.tenantId, v1.id, ids]);
  const studio = await service(StudioService);
  await withTenant(c.tenantId, async (tx) => {
    // Made as a draft, then generated as the principal would from the studio.
    const [v2] = await tx.execute<{ id: string }>(
      sql`insert into timetable_versions (tenant_id, academic_year_id, version_no, name, status, section_ids, source, settings, notes, created_by)
        values (${c.tenantId}::uuid, ${c.years.cur}::uuid, 2, 'Odd semester 2026: BCom Sem 3 with Tally lab and open elective', 'draft', ${`{${ids.join(',')}}`}::uuid[], 'generated', '{}'::jsonb, 'From the second half of the semester: the lab in two batches and the open elective in parallel.', ${principalId}::uuid) returning id`,
    ).then((x) => x.rows);
    await studio.generate(tx, as(principalId, ['principal']), v2.id);
  });

  // 7. The teaching diary: every held period of the term-3 classes up to yesterday, most of them logged.
  const term3 = c.sections.filter((s) => s.term === 3);
  const hod = c.byEmail['hod.commerce'];
  const rows: Record<string, unknown>[] = [];
  for (const s of term3) {
    const slots = await k.q<{ id: string; subjectId: string; teacherId: string; dayOfWeek: number; startsAt: string; endsAt: string }>(
      "select id, subject_id, teacher_id, day_of_week, to_char(starts_at,'HH24:MI') as starts_at, to_char(ends_at,'HH24:MI') as ends_at from timetable_slots where tenant_id = $1 and section_id = $2 and archived_at is null",
      [c.tenantId, s.id],
    );
    const held = new Set((await k.q<{ key: string }>("select distinct timetable_slot_id::text || '|' || date::text as key from attendance_records where tenant_id = $1 and section_id = $2 and timetable_slot_id is not null", [c.tenantId, s.id])).map((x) => x.key));
    const plans = new Map((await k.q<{ key: string; topicIds: string[] }>("select timetable_slot_id::text || '|' || date::text as key, topic_ids from lesson_plans where tenant_id = $1 and section_id = $2", [c.tenantId, s.id])).map((x) => [x.key, x.topicIds]));
    for (const sub of s.subjects) {
      const covered = await k.q<{ topicId: string; coveredOn: string }>(
        "select tc.topic_id, tc.covered_on::text as covered_on from topic_coverage tc join topics t on t.id = tc.topic_id join chapters ch on ch.id = t.chapter_id join subjects sb on sb.course_id = ch.course_id where tc.section_id = $1 and sb.id = $2 order by tc.covered_on, ch.position, t.position",
        [s.id, sub.id],
      );
      const titles = covered.length ? new Map((await k.q<{ id: string; title: string }>('select id, title from topics where id = any($1::uuid[])', [covered.map((x) => x.topicId)])).map((t) => [t.id, t.title])) : new Map<string, string>();
      const meetings = c.workingDays.flatMap((d) => slots.filter((x) => x.subjectId === sub.id && x.dayOfWeek === weekday(d)).map((x) => ({ slot: x, date: d }))).filter((m) => held.has(`${m.slot.id}|${m.date}`));
      // Topics go to the first meeting on or after the day they were taught; the rest are practice, revision or tests.
      const queue = [...covered];
      const recentCut = c.workingDays[Math.max(0, c.workingDays.length - 3)] ?? c.today;
      for (const [i, m] of meetings.entries()) {
        // A few recent periods are left for the teacher to log (the pending list); one in twelve older ones too.
        if ((m.date >= recentCut && r.chance(0.5)) || r.chance(1 / 12)) continue;
        const topics: string[] = [];
        while (queue.length && queue[0].coveredOn <= m.date && topics.length < 2) topics.push(queue.shift()!.topicId);
        const plan = plans.get(`${m.slot.id}|${m.date}`) ?? null;
        const verdict = againstPlan(plan, topics);
        const delivery = topics.length ? DELIVERIES[i % DELIVERIES.length] : i % 5 === 0 ? 'test' : 'revision';
        const summary = topics.length ? `${topics.map((t) => titles.get(t) ?? '').filter(Boolean).join('; ')}: explained with worked examples from the textbook and two problems on the board.` : delivery === 'test' ? 'Ten-minute class test on the last unit, then discussion of answers.' : 'Revision of the previous unit and solving university question paper problems.';
        const reviewed = m.date < addDays(c.today, -7) && sub.dept === 'Commerce' && hod && r.chance(0.7);
        rows.push({
          sectionId: s.id,
          subjectId: sub.id,
          teacherId: m.slot.teacherId,
          timetableSlotId: m.slot.id,
          date: m.date,
          startsAt: m.slot.startsAt,
          endsAt: m.slot.endsAt,
          topicIds: `{${topics.join(',')}}`,
          delivery,
          summary,
          againstPlan: verdict,
          deviationReason: verdict === 'behind' ? r.pick(['Students needed more practice on the previous topic', 'Period shortened for the NSS orientation', 'Spent time on doubts before the internal test']) : '',
          source: r.pick(['teacher_app', 'teacher_app', 'board', 'erp']),
          reviewedBy: reviewed ? hod.id : null,
          reviewedAt: reviewed ? new Date(`${addDays(m.date, 3)}T10:30:00Z`) : null,
          reviewRemark: reviewed && verdict === 'behind' ? 'Plan an extra period to catch up before IA 2' : null,
        });
      }
    }
  }
  await k.ins('teaching_logs', rows, { returning: false });
}
