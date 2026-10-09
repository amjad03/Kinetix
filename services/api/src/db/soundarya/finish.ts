/** Syllabus coverage and year plans, substitutions, AI usage and the remaining small tables. */
import { mondayOf, periodDates, spreadTopics } from '../../plans/planner.js';
import { ObjectStorage, bufferStream } from '../../storage/storage.service.js';
import type { Ctx } from './ctx.js';
import { addDays, at, weekday } from './kit.js';
import { service } from './nest.js';

/** Our papers whose names match the library syllabus already loaded by the base seed (Bangalore University NEP). */
const LIBRARY_CODES: Record<string, string> = {
  'BCM:3:Corporate Accounting': 'bcom-3-corporate-accounting',
  'BCM:3:Cost Accounting': 'bcom-3-cost-accounting',
  'BCM:3:Financial Management': 'bcom-3-financial-management',
  'BCM:3:Indian Financial System': 'bcom-3-indian-financial-system',
  'BCA:1:Problem Solving Techniques using C': 'bca-1-problem-solving-c',
  'BCA:1:Discrete Mathematics': 'bca-1-discrete-mathematics',
  'BCA:1:Computer Architecture': 'bca-1-computer-architecture',
};

export async function syllabus(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const slots = await k.q<{ id: string; sectionId: string; subjectId: string; dayOfWeek: number }>('select id, section_id, subject_id, day_of_week from timetable_slots where tenant_id = $1', [c.tenantId]);
  const planStart = mondayOf('2026-08-03');
  const planEnd = '2026-12-15';
  for (const sec of c.sections) {
    for (const sub of sec.subjects) {
      const code = LIBRARY_CODES[`${sec.prog}:${sec.term}:${sub.name}`];
      if (!code) continue;
      const [course] = await k.q<{ id: string }>('select id from courses where code = $1', [code]);
      if (!course) continue; // the library has not been imported on this database
      await k.q('update subjects set course_id = $2 where id = $1', [sub.id, course.id]);
      const topics = await k.q<{ id: string; title: string }>('select t.id, t.title from topics t join chapters ch on ch.id = t.chapter_id where ch.course_id = $1 order by ch.position, t.position', [course.id]);
      if (!topics.length) continue;
      const mine = slots.filter((x) => x.subjectId === sub.id);
      const dates = periodDates(mine.map((x) => x.dayOfWeek), planStart, planEnd, (d) => c.holidays.has(d));
      const plan = await k.one<{ id: string }>('year_plans', { sectionId: sec.id, subjectId: sub.id, startsOn: planStart, endsOn: planEnd, createdBy: sub.teacherId });
      await k.ins('year_plan_items', spreadTopics(topics.map((x) => x.id), dates).map((i) => ({ planId: plan.id, ...i })), { returning: false });
      const covered = topics.slice(0, Math.max(3, Math.floor(topics.length * (0.35 + r.next() * 0.2))));
      await k.ins('topic_coverage', covered.map((t, i) => ({ sectionId: sec.id, topicId: t.id, coveredOn: addDays('2026-08-05', Math.floor((i * 55) / covered.length)), coveredBy: sub.teacherId })), { returning: false });
      // Tomorrow's lesson plan now names its topic.
      const next = covered.length < topics.length ? topics[covered.length] : topics[0];
      await k.q("update lesson_plans set topic_ids = $3::uuid[] where section_id = $1 and subject_id = $2", [sec.id, sub.id, [next.id]]);
    }
  }
}

export async function smallTables(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const storage = await service(ObjectStorage);
  const slots = await k.q<{ id: string; sectionId: string; subjectId: string; teacherId: string; dayOfWeek: number; startsAt: string }>("select id, section_id, subject_id, teacher_id, day_of_week, to_char(starts_at,'HH24:MI') as starts_at from timetable_slots where tenant_id = $1", [c.tenantId]);
  // Substitutions: a teacher on approved leave is covered by a colleague of the same department.
  const approved = await k.q<{ id: string; userId: string; fromDate: string }>("select id, user_id, from_date from leave_requests where tenant_id = $1 and status = 'approved' and from_date >= $2 order by (from_date >= $3::date) desc, from_date limit 8", [c.tenantId, '2026-08-03', c.today]);
  const subs: Record<string, unknown>[] = [];
  for (const lv of approved) {
    const t = c.teachers.find((x) => x.id === lv.userId);
    if (!t) continue;
    const mine = slots.filter((s) => s.teacherId === t.id && s.dayOfWeek === weekday(lv.fromDate)).slice(0, 2);
    const cover = c.teachers.find((x) => x.dept === t.dept && x.id !== t.id && !x.email.startsWith('hod.')) ?? c.teachers.find((x) => x.id !== t.id)!;
    for (const sl of mine) subs.push({ slotId: sl.id, date: lv.fromDate, originalTeacherId: t.id, substituteTeacherId: cover.id, reason: 'Approved leave', leaveRequestId: lv.id, status: 'confirmed', createdBy: c.byEmail['hod.commerce'].id });
  }
  await k.ins('teacher_substitutions', subs, { returning: false });

  await k.ins('ai_usage', Array.from({ length: 80 }, (_, i) => ({ userId: c.teachers[i % c.teachers.length].id, task: ['explain', 'quiz', 'homework', 'lessonPlan', 'summarize', 'boardSummary', 'transcribe', 'financeInsight', 'admissionsInsight', 'hrInsight'][i % 10], outcome: i % 17 === 0 ? 'blocked' : i % 11 === 0 ? 'cached' : 'ok', provider: 'anthropic', model: i % 4 === 0 ? 'claude-sonnet' : 'claude-haiku', promptVersion: 'v3', promptTokens: 400 + (i * 37) % 1500, completionTokens: 150 + (i * 53) % 900, latencyMs: 700 + (i * 91) % 3000, audioMs: i % 10 === 6 ? 1500000 : null, estCostInr: (0.1 + ((i * 13) % 40) / 10).toFixed(4), createdAt: at(addDays(c.today, -(i % 28)), '11:00') })), { returning: false });

  const bcm3 = c.sections.find((s) => s.prog === 'BCM' && s.term === 3)!;
  await k.ins('answer_cards', bcm3.students.map((st, i) => ({ sectionId: bcm3.id, cardNo: i + 1, studentId: st.id })), { returning: false });
  const devices = await k.q<{ id: string }>('select id from devices where tenant_id = $1', [c.tenantId]);
  const bcasts = await k.q<{ id: string }>('select id from broadcasts where tenant_id = $1 order by created_at', [c.tenantId]);
  await k.ins('broadcast_receipts', bcasts.slice(0, 2).flatMap((b) => devices.map((d, i) => ({ broadcastId: b.id, deviceId: d.id, displayedAt: at(addDays(c.today, -1), '09:05'), acknowledgedAt: i < 3 ? at(addDays(c.today, -1), '09:07') : null, acknowledgedBy: i < 3 ? c.teachers[i].id : null }))), { returning: false });
  await k.ins('device_profiles', devices.flatMap((d, i) => c.teachers.slice(i * 3, i * 3 + 3).map((t) => ({ deviceId: d.id, userId: t.id, failedAttempts: 0, lastUsedAt: at(addDays(c.today, -1), '10:00') }))), { returning: false });
  const bs = await k.q<{ id: string; deviceId: string; teacherId: string }>('select id, device_id, teacher_id from board_sessions where tenant_id = $1 order by started_at desc limit 2', [c.tenantId]);
  await k.ins('cast_sessions', bs.map((b, i) => ({ deviceId: b.deviceId, boardSessionId: b.id, userId: c.students[i].userId ?? b.teacherId, senderName: c.students[i].name, senderRole: 'student', state: 'ended', endReason: 'ended', startedAt: at(addDays(c.today, -2), '10:20'), endedAt: at(addDays(c.today, -2), '10:30') })), { returning: false });
  const some = slots.filter((s) => s.startsAt === '14:00').slice(0, 4);
  await k.ins('class_meetings', some.map((sl, i) => ({ provider: 'zoom', slotId: sl.id, topic: ['Doubt-clearing session', 'Guest lecture: GST updates', 'Revision for IA 2', 'Placement preparation'][i], startsAt: at(addDays(c.today, 2 + i), '18:00'), durationMin: 60, externalId: `8${r.int(10000000, 99999999)}`, joinUrl: `https://zoom.us/j/demo-meeting-${i + 1}`, hostUrl: `https://zoom.us/s/demo-host-${i + 1}`, createdBy: sl.teacherId })), { returning: false });

  // Grace marks, grade overrides and whiteboard exports.
  const failed = await k.q<{ studentId: string; subjectId: string; sessionId: string }>('select r.student_id, l.subject_id, r.session_id from exam_result_lines l join exam_results r on r.id = l.result_id where l.passed = false limit 3', []);
  await k.ins('grace_awards', failed.map((f) => ({ sessionId: f.sessionId, studentId: f.studentId, subjectId: f.subjectId, marks: 2, appliedBy: c.byEmail.principal.id })), { returning: false });
  const lmsCats = await k.q<{ id: string }>('select id from lms_grade_categories where tenant_id = $1 limit 2', [c.tenantId]);
  await k.ins('lms_grade_overrides', lmsCats.map((cat, i) => ({ categoryId: cat.id, studentId: c.students[i * 5].id, percent: 72 + i * 6, reason: 'Missed the test for a university sports event; re-test marks entered', setBy: c.teachers[0].id })), { returning: false });
  const wbs = await k.q<{ id: string; ownerId: string }>('select id, owner_id from whiteboards where tenant_id = $1 limit 2', [c.tenantId]);
  const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  for (const [i, w] of wbs.entries()) {
    const key = `tenants/${c.tenantId}/whiteboards/export-${i}.pdf`;
    await storage.put(key, bufferStream(PDF), 1024 * 1024, 'application/pdf');
    await k.ins('whiteboard_exports', { whiteboardId: w.id, token: `seed-export-token-${i}-${r.int(100000, 999999)}`, storageKey: key, pageCount: 2, sizeBytes: PDF.length, createdBy: w.ownerId, expiresAt: at(addDays(c.today, 20)) }, { returning: false });
  }
  const vault = await k.q<{ id: string; storageKey: string }>('select id, storage_key from vault_documents where tenant_id = $1', [c.tenantId]);
  await k.ins('upload_scans', vault.map((v) => ({ subjectType: 'vault_document', subjectId: v.id, storageKey: v.storageKey, status: 'clean', signature: null, attempts: 1, scannedAt: at(addDays(c.today, -1)) })), { returning: false });
}
