/**
 * The LMS pass on the demo college: the institution's LMS settings, lesson pages, a quiz item and a SCORM package in
 * each course, completion rules and certificates, quizzes with negative marking and proctoring signals (some attempts
 * flagged), live classes with joins and one tomorrow, students' progress by how engaged they are (so the at-risk list
 * has names), forum discussions with a held post and an open report, a learning path, and certificates issued
 * through the document register for the students who completed the first course of each class.
 */
import { DocumentEngine } from '../../documents/document-engine.service.js';
import { studentBlock } from '../../documents/doc-data.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J } from './kit.js';
import { service, withTenant } from './nest.js';

const SCO = `<html><head><title>Ledger posting</title></head><body><h1>Posting to the ledger</h1><p>Each journal entry is posted to two accounts.</p>
<script>var a=window.API;a&&a.LMSInitialize('');function done(){a.LMSSetValue('cmi.core.score.raw','85');a.LMSSetValue('cmi.core.lesson_status','passed');a.LMSCommit('');a.LMSFinish('');}</script>
<button onclick="done()">I have finished</button></body></html>`;

export async function lmsPass(c: Ctx, o: { certificates?: boolean } = {}): Promise<void> {
  const k = c.kit;
  const t = c.tenantId;
  const principal = c.byEmail.principal.id;
  const today = c.today;
  const now = at(today, '11:00');
  const r = c.r;

  await k.one('lms_settings', { tenantId: t, settings: { forumModeration: 'open', forumAutoHideReports: 3, forumEditMinutes: 15, plagiarismAutoCheck: true, plagiarismThresholdPct: 40, atRiskInactiveDays: 7, atRiskEngagementBelowPct: 40, atRiskQuizBelowPct: 40, atRiskOverdueCount: 2, liveLateAfterMin: 10, certificateSelfClaim: true }, updatedBy: principal }, { noTenant: true });

  // One SCORM 1.2 package the courses share (financial accounting basics), with its files in the database.
  const manifest = `<?xml version="1.0"?><manifest identifier="ledger"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="o"><organization identifier="o"><title>Ledger posting (interactive)</title><item identifier="i1" identifierref="r1"><title>Posting</title></item></organization></organizations><resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="sco/index.html"/></resources></manifest>`;
  const files = [{ path: 'imsmanifest.xml', data: Buffer.from(manifest), mime: 'application/xml' }, { path: 'sco/index.html', data: Buffer.from(SCO), mime: 'text/html; charset=utf-8' }];
  const pkg = await k.one<{ id: string }>('scorm_packages', { title: 'Ledger posting (interactive)', version: '1.2', launchHref: 'sco/index.html', manifest: { items: [{ id: 'i1', title: 'Posting', href: 'sco/index.html' }] }, fileCount: files.length, createdBy: principal });
  await k.ins('scorm_files', files.map((f) => ({ packageId: pkg.id, path: f.path, mime: f.mime, content: f.data })), { returning: false });

  const courses = await k.q<{ id: string; sectionId: string; subjectId: string; title: string; createdBy: string }>('select id, section_id, subject_id, title, created_by from lms_courses where tenant_id = $1 order by created_at', [t]);
  const firstOfSection = new Set<string>();
  let pathCourses: string[] = [];
  const certTargets: { courseId: string; title: string; studentId: string; pct: number }[] = [];
  for (const [ci, course] of courses.entries()) {
    const sec = c.sections.find((s) => s.id === course.sectionId);
    if (!sec) continue;
    const first = !firstOfSection.has(sec.id);
    firstOfSection.add(sec.id);
    const teacher = course.createdBy;
    const mods = await k.q<{ id: string; position: number }>('select id, position from lms_modules where course_id = $1 order by position', [course.id]);
    if (!mods.length) continue;
    await k.q('update lms_courses set completion_pct = 80, certificate = $2 where id = $1', [course.id, first]);
    if (sec.prog === 'BCM' && sec.term === 3 && pathCourses.length < 2) pathCourses.push(course.id);
    // A lesson page per unit, a SCORM package in unit 1 and a quiz item in unit 2.
    await k.ins('lms_items', mods.map((m, mi) => ({ moduleId: m.id, position: 3, kind: 'page', title: `Unit ${mi + 1} summary`, body: `Key ideas of unit ${mi + 1}:\n\n1. Definitions and the reason each rule exists.\n2. A worked example from an Indian company's annual report.\n3. Five practice questions (answers in the next class).`, durationMin: 8, sizeKb: 3, completionRule: 'view' })), { returning: false });
    await k.one('lms_items', { moduleId: mods[0].id, position: 4, kind: 'scorm', title: 'Ledger posting (interactive)', refId: pkg.id, completionRule: 'pass', passPct: 60, sizeKb: 40, offline: false });

    // Quizzes: a closed one with attempts and an open one this week.
    const q1 = await k.one<{ id: string }>('lms_quizzes', { sectionId: course.sectionId, subjectId: course.subjectId, title: `Unit 1 quiz`, instructions: 'Ten minutes. A wrong answer loses a quarter of its marks.', opensAt: at(addDays(today, -12), '09:00'), closesAt: at(addDays(today, -5), '18:00'), durationMin: 10, maxAttempts: 1, status: 'closed', negativePct: 25, proctoring: 'record', maxViolations: 5, review: 'after_close', passPct: 40, createdBy: teacher });
    const q2 = await k.one<{ id: string }>('lms_quizzes', { sectionId: course.sectionId, subjectId: course.subjectId, title: `Unit 2 quiz`, instructions: 'Fifteen minutes, one attempt. Stay on the quiz page: leaving it is recorded.', opensAt: at(addDays(today, -1), '09:00'), closesAt: at(addDays(today, 4), '18:00'), durationMin: 15, maxAttempts: 1, status: 'published', negativePct: 25, proctoring: 'strict', maxViolations: 4, review: 'after_close', passPct: 40, createdBy: teacher });
    const qs = await k.ins<{ id: string }>('lms_quiz_questions', [0, 1, 2, 3, 4].map((i) => ({ quizId: q1.id, position: i, kind: 'mcq', text: [`Which statement of ${course.title.split(' (')[0]} is shown first in the unit?`, 'Which of these is a real account?', 'A prepaid expense is shown as', 'Depreciation is charged on', 'The accounting year in India ends on'][i], options: J([[{ text: 'The definition', correct: true }, { text: 'The summary', correct: false }, { text: 'The exercise', correct: false }], [{ text: 'Machinery', correct: true }, { text: 'Salary', correct: false }, { text: 'Capital', correct: false }], [{ text: 'An asset', correct: true }, { text: 'A liability', correct: false }, { text: 'An income', correct: false }], [{ text: 'Fixed assets', correct: true }, { text: 'Stock', correct: false }, { text: 'Cash', correct: false }], [{ text: '31 March', correct: true }, { text: '31 December', correct: false }, { text: '30 June', correct: false }]][i]), marks: 2, difficulty: ['easy', 'easy', 'medium', 'medium', 'hard'][i] })));
    await k.ins('lms_quiz_questions', [0, 1, 2].map((i) => ({ quizId: q2.id, position: i, kind: 'mcq', text: ['Goodwill is', 'Interest on drawings is', 'A partnership needs at least'][i], options: J([[{ text: 'An intangible asset', correct: true }, { text: 'A current asset', correct: false }], [{ text: 'An income of the firm', correct: true }, { text: 'An expense of the firm', correct: false }], [{ text: 'Two partners', correct: true }, { text: 'Seven partners', correct: false }]][i]), marks: 2 })), { returning: false });
    await k.one('lms_items', { moduleId: mods[Math.min(1, mods.length - 1)].id, position: 5, kind: 'quiz', title: 'Unit 1 quiz', refId: q1.id, completionRule: 'pass', sizeKb: 1 });

    // Live classes: two held (with joins), one tomorrow.
    const slot = (await k.q<{ id: string }>('select id from timetable_slots where tenant_id = $1 and section_id = $2 and subject_id = $3 limit 1', [t, course.sectionId, course.subjectId]))[0];
    const lives = await k.ins<{ id: string; startsAt: Date }>('lms_live_sessions', [
      { courseId: course.id, title: 'Doubt-clearing session', startsAt: at(addDays(today, -8), '16:00'), durationMin: 45, joinUrl: 'https://meet.google.com/kxs-demo-one', provider: 'meet', slotId: slot?.id ?? null, recordingUrl: 'https://learn.soundarya.demo.zynetix.in/recordings/doubt-1', attendanceMarkedAt: at(addDays(today, -8), '17:00'), createdBy: teacher },
      { courseId: course.id, title: 'Revision before IA 2', startsAt: at(addDays(today, -2), '16:00'), durationMin: 60, joinUrl: 'https://zoom.us/j/9876543210', provider: 'zoom', slotId: slot?.id ?? null, createdBy: teacher },
      { courseId: course.id, title: 'Case discussion', startsAt: at(addDays(today, 1), '16:00'), durationMin: 45, joinUrl: 'https://teams.microsoft.com/l/meetup-join/demo', provider: 'teams', slotId: slot?.id ?? null, createdBy: teacher },
    ]);

    // Students' activity follows how engaged they are: strong, regular students open most things.
    const items = await k.q<{ id: string; kind: string; completionRule: string }>('select i.id, i.kind, i.completion_rule from lms_items i join lms_modules m on m.id = i.module_id where m.course_id = $1 order by m.position, i.position', [course.id]);
    const prog: Record<string, unknown>[] = [];
    const attempts: Record<string, unknown>[] = [];
    const joins: Record<string, unknown>[] = [];
    for (const s of sec.students) {
      const engagement = Math.min(1, Math.max(0, s.presence * 0.7 + s.ability * 0.5 - 0.15 + (r.next() - 0.5) * 0.2));
      const lastDay = engagement > 0.35 ? r.int(0, 4) : r.int(9, 20);
      let opened = 0;
      for (const [ii, it] of items.entries()) {
        if (r.next() > engagement) continue;
        opened++;
        const seen = at(addDays(today, -Math.min(25, lastDay + Math.max(0, items.length - ii) )), '19:30');
        const done = it.completionRule === 'view' || (it.kind === 'scorm' && s.ability > 0.45) || (it.kind === 'quiz' && s.ability > 0.35) || (it.completionRule === 'mark_done' && r.chance(0.7));
        prog.push({ itemId: it.id, studentId: s.id, views: r.int(1, 4), firstViewedAt: seen, lastViewedAt: ii === items.length - 1 || opened === 1 ? at(addDays(today, -lastDay), '20:00') : seen, completedAt: done ? seen : null });
      }
      // Unit 1 quiz: most took it; a wrong answer cost half a mark.
      if (r.next() < 0.85) {
        let score = 0;
        const results: Record<string, { correct: boolean; marks: number }> = {};
        const answers: Record<string, number[]> = {};
        for (const q of qs) {
          const right = r.next() < 0.35 + s.ability * 0.6;
          const blank = !right && r.chance(0.25);
          results[q.id] = { correct: right, marks: right ? 2 : blank ? 0 : -0.5 };
          answers[q.id] = blank ? [] : [right ? 0 : 1];
          score += results[q.id].marks;
        }
        const violations = s.ability < 0.45 && r.chance(0.35) ? r.int(5, 8) : r.int(0, 2);
        const startedAt = at(addDays(today, -r.int(6, 11)), '10:15');
        attempts.push({ quizId: q1.id, studentId: s.id, attemptNo: 1, questionIds: qs.map((q) => q.id), answers: J(answers), results: J(results), score: Math.max(0, score), maxScore: 10, startedAt, dueAt: new Date(startedAt.getTime() + 10 * 60_000), submittedAt: new Date(startedAt.getTime() + r.int(4, 9) * 60_000), violations, flagged: violations >= 5 });
      }
      for (const l of lives.slice(0, 2)) if (r.next() < engagement + 0.1) joins.push({ sessionId: l.id, studentId: s.id, firstJoinedAt: new Date(l.startsAt.getTime() + r.int(-5, 18) * 60_000), lastJoinedAt: new Date(l.startsAt.getTime() + r.int(20, 40) * 60_000), joins: r.int(1, 2) });
      if (first && engagement > 0.8 && certTargets.filter((x) => x.courseId === course.id).length < 4) certTargets.push({ courseId: course.id, title: course.title, studentId: s.id, pct: Math.round(80 + engagement * 20 > 100 ? 100 : 80 + engagement * 20) });
    }
    await k.ins('lms_item_progress', prog, { returning: false });
    const att = await k.ins<{ id: string; violations: number }>('lms_quiz_attempts', attempts);
    const ev: Record<string, unknown>[] = [];
    for (const a of att.filter((x) => x.violations > 0)) for (let i = 0; i < a.violations; i++) ev.push({ attemptId: a.id, kind: ['tab_hidden', 'window_blur', 'copy', 'app_background'][i % 4], at: now, detail: i === 0 ? 'Left the quiz page' : '' });
    await k.ins('lms_quiz_events', ev, { returning: false });
    await k.ins('lms_live_joins', joins, { returning: false });

    // Discussion: a question with replies, a held post (pre-moderated) and one open report in the first course.
    if (ci < 6) {
      const asker = sec.students.find((s) => s.userId);
      const other = sec.students.filter((s) => s.userId)[1];
      if (asker) {
        const [th] = await k.ins<{ id: string }>('forum_threads', [{ courseId: course.id, authorId: asker.userId, title: 'How do we treat interest on capital?', body: 'Is it a charge against profit or an appropriation? The textbook and the notes seem to differ.', createdAt: at(addDays(today, -3), '18:10'), lastPostAt: at(addDays(today, -2), '09:40') }]);
        const posts = await k.ins<{ id: string }>('forum_posts', [
          { threadId: th.id, authorId: teacher, body: 'An appropriation, unless the partnership deed says otherwise. See Section 13 of the Partnership Act.', createdAt: at(addDays(today, -2), '09:40') },
          ...(other ? [{ threadId: th.id, authorId: other.userId, body: 'Thanks. So it goes to the P&L appropriation account.', createdAt: at(addDays(today, -2), '12:00') }, { threadId: th.id, authorId: other.userId, body: 'Can someone share last year’s answers?', held: ci === 0, createdAt: at(addDays(today, -1), '21:00') }] : []),
        ]);
        if (ci === 0 && other && posts[2]) await k.one('forum_reports', { threadId: th.id, postId: posts[2].id, reporterId: asker.userId, reason: 'cheating', note: 'Asking for answers to the assignment' });
      }
    }
  }

  // A learning path for the B.Com third semester: its two courses, the first required.
  if (pathCourses.length) {
    const sec = c.sections.find((s) => s.prog === 'BCM' && s.term === 3);
    const path = await k.one<{ id: string }>('lms_learning_paths', { title: 'Accounting foundations track', description: 'Financial accounting first, then the second course. Finish the required course to earn the track certificate.', programId: sec?.programId ?? null, status: 'published', certificate: true, createdBy: principal });
    await k.ins('lms_path_steps', pathCourses.map((courseId, i) => ({ pathId: path.id, courseId, position: i + 1, required: i === 0 })), { returning: false });
  }

  // Certificates for the students who completed the first course of their class, through the document register.
  if (o.certificates === false || !certTargets.length) return;
  const engine = await service(DocumentEngine);
  const done: [string, string, string, string][] = [];
  await withTenant(t, async (tx) => {
    for (const x of certTargets.slice(0, 24)) {
      const [row] = await k.ins<{ id: string }>('lms_certificates', [{ studentId: x.studentId, courseId: x.courseId, serial: 'PENDING', completedPct: x.pct, issuedAt: now, issuedBy: principal }]);
      const st = c.students.find((s) => s.id === x.studentId)!;
      const title = 'Course completion certificate';
      const out = await engine.produce(tx, { tenantId: t, userId: principal }, {
        docType: 'course_completion_certificate',
        title,
        subject: { type: 'student', id: x.studentId, name: st.name },
        source: { type: 'lms_certificate', id: row.id },
        data: { ...(await studentBlock(tx, x.studentId)), doc: { title }, award: { title, recipient: st.name, citation: `has successfully completed the course **${x.title}** at this institution, finishing ${x.pct}% of the course work.`, event: x.title, date: '', position: '' } },
        keyFields: [{ label: 'Document', value: title }, { label: 'Student', value: `${st.name} (${st.rollNo})` }, { label: 'Course', value: x.title }, { label: 'Completed', value: `${x.pct}%` }],
      });
      done.push([row.id, out.record.serial, out.record.verifyUrl, out.record.id]);
    }
  });
  // After the register's transaction has committed.
  for (const d of done) await k.q('update lms_certificates set serial = $2, verify_url = $3, issued_document_id = $4 where id = $1', d);
}
