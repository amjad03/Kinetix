/**
 * Samples for the requirements gap close (PRD sections 1-21, migration 0117): institution setup, boards, attendance and fee rules, trusted devices,
 * identity roles, landing page and prior schooling, scoped calendars, subject frequency, faculties and frameworks, learning support (worksheets, mastery,
 * extra help, readiness, promotion), forums, rubrics, reattempts and integrity flags. Soundarya is a college, so the school-flavoured samples are modest.
 */
import { createHash } from 'node:crypto';
import { DOMAIN } from './data.js';
import type { Ctx } from './ctx.js';
import { addDays, J, rupees } from './kit.js';

const hex = (s: string) => createHash('sha256').update(s).digest('hex');

export async function gapClose(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;
  const teacher = c.teachers[0];
  const bcm = c.programs.BCM;
  const bca = c.programs.BCA;
  const bav = c.programs.BAV;

  // ---- institution setup: type, structure, policies, wording, boards ----
  await k.q('insert into institution_profiles (tenant_id) values ($1) on conflict (tenant_id) do nothing', [c.tenantId]);
  await k.q(
    `update institution_profiles set institution_type = 'autonomous_college', structure_model = 'PROGRAM_SEMESTER_COURSE', governance_model = 'autonomous', fee_model = 'semester_fees', quality_framework = 'NAAC',
       languages = $2::jsonb, ai_policy = $3::jsonb, privacy_settings = $4::jsonb, comms_channels = $5::jsonb, terminology = $6::jsonb, preset_key = 'soundarya' where tenant_id = $1`,
    [
      c.tenantId,
      JSON.stringify(['en', 'kn']),
      JSON.stringify({ enabled: true, allowStudentFacing: true, requireTeacherReview: true }),
      JSON.stringify({ parentSeesMarks: true, showStudentPhotos: true }),
      JSON.stringify({ push: true, sms: true, email: true, whatsapp: false }),
      JSON.stringify({ 'nav.classes': 'Sections' }),
    ],
  );
  await k.ins(
    'school_boards',
    [
      { code: 'BCU', name: 'Bengaluru City University', kind: 'university', region: 'Karnataka', medium: 'English', gradingScheme: 'cgpa', passRules: J({ subjectPassPct: 40, aggregatePassPct: 40, graceMarks: 3, maxCompartmentSubjects: 2 }), isPrimary: true },
      { code: 'KSEAB-PUC', name: 'Department of Pre-University Education, Karnataka', kind: 'state', region: 'Karnataka', medium: 'English', gradingScheme: 'marks', passRules: J({ subjectPassPct: 35, graceMarks: 5, maxCompartmentSubjects: 3 }), isPrimary: false },
    ],
    { returning: false },
  );
  const attendance: [typeof bca | undefined, number, number | null, string][] = [
    [bca, 80, 48, 'Lab-heavy programme: regular presence needed.'],
    [bav, 85, 24, 'Aviation training hours are regulated.'],
  ];
  await k.ins('attendance_overrides', attendance.flatMap(([p, pct, lock, note]) => (p ? [{ programId: p.id, thresholdPct: pct, lockHours: lock, note }] : [])), { returning: false });
  await k.ins('campus_settings', [{ campusId: c.campusId, feeModel: 'semester_fees', gradingPolicy: 'cgpa', settings: J({ lateFeePct: 2, receiptPrefix: 'SIMS' }) }], { returning: false });
  if (bcm) {
    await k.ins(
      'fee_structures',
      [
        { campusId: c.campusId, programId: bcm.id, name: 'BCom 2026-27 semester fee', items: J([{ head: 'Tuition', amountPaise: rupees(bcm.def.feeInr * 0.8) }, { head: 'Library and lab', amountPaise: rupees(bcm.def.feeInr * 0.12) }, { head: 'Student activities', amountPaise: rupees(bcm.def.feeInr * 0.08) }]), dueInDays: 30, createdBy: principal },
        { campusId: c.campusId, name: 'Main campus exam fee', items: J([{ head: 'Semester exam', amountPaise: rupees(1200) }]), dueInDays: 15, createdBy: principal },
      ],
      { returning: false },
    );
  }

  // ---- trusted devices and the new identity roles ----
  await k.ins(
    'trusted_devices',
    [
      { userId: principal, deviceHash: hex('principal-laptop'), label: 'Principal office laptop', platform: 'web' },
      { userId: principal, deviceHash: hex('principal-phone'), label: 'Principal phone', platform: 'android' },
      { userId: teacher.id, deviceHash: hex('staff-tablet'), label: 'Staff room tablet', platform: 'android', revokedAt: new Date() },
    ],
    { returning: false },
  );
  const roleUsers: [string, string, string][] = [
    ['external.examiner', 'Dr. Meenakshi Rao (external examiner, Mysore University)', 'external_examiner'],
    ['accreditation', 'Prof. Harish Kamath (NAAC peer team reviewer)', 'accreditation_reviewer'],
    ['university.admin', 'Mr. Suresh Babu (university liaison)', 'university_admin'],
  ];
  for (const [prefix, name, role] of roleUsers) {
    const [u] = await k.ins<{ id: string }>('users', [{ fullName: name, email: `${prefix}@${DOMAIN}`, passwordHash: c.hash, status: 'active' }]);
    await k.ins('user_roles', [{ userId: u.id, role, campusId: c.campusId }], { returning: false });
  }
  await k.ins('user_roles', [{ userId: c.teachers[1]?.id ?? teacher.id, role: 'mentor', campusId: c.campusId }], { returning: false });

  // ---- admissions: landing page, prior schooling, a correction round, a deferred student ----
  const cycles = await k.q<{ id: string; name: string }>('select id, name from admission_cycles where tenant_id = $1 order by opens_on desc, name limit 2', [c.tenantId]);
  if (cycles[0]) {
    await k.ins(
      'admission_landing_pages',
      [{ cycleId: cycles[0].id, headline: `Join Soundarya: ${cycles[0].name}`, intro: 'An autonomous college in Bengaluru with NEP programmes, placements and a hostel on campus.', highlights: J([{ title: 'NAAC accredited', text: 'Grade A with a strong placement record' }, { title: 'Hostel and transport', text: 'Boys and girls hostels and bus routes across the city' }, { title: 'Scholarships', text: 'Merit and need-based fee support' }]), faqs: J([{ q: 'What is the last date to apply?', a: 'See the date on this page; late applications are not taken.' }, { q: 'Can I upload documents later?', a: 'Yes, from your tracking page before the offer is made.' }]), contactPhone: '+918045678901', contactEmail: `admissions@${DOMAIN}`, accentColour: '#1d4ed8', published: true }],
      { returning: false },
    );
    const [app] = await k.q<{ id: string }>("select id from applications where tenant_id = $1 and status = 'under_review' order by submitted_at limit 1", [c.tenantId]);
    if (app) {
      const note = { at: new Date().toISOString(), by: principal, notes: 'The date of birth does not match the marksheet.', items: ['Date of birth', 'Marksheet'] };
      await k.q("update applications set status = 'correction_requested', status_reason = $2, correction_notes = $3::jsonb, correction_due_on = $4 where id = $1", [app.id, note.notes, JSON.stringify([note]), addDays(c.today, 7)]);
    }
  }
  const schools = ['Vidya PU College, Bengaluru', 'Sharada Composite PU College, Mysuru', 'National PU College, Tumakuru', 'Cluny Convent PU College, Bengaluru', 'St. Joseph\'s PU College, Mangaluru'];
  await k.ins(
    'student_prior_education',
    c.students.slice(0, 20).flatMap((s, i) => [
      { studentId: s.id, level: 'puc', institution: schools[i % schools.length], board: 'Karnataka PUC', passingYear: 2022 + (s.term > 4 ? 0 : 1), percentage: (58 + r.next() * 36).toFixed(2), tcNumber: `TC/${2022 + (i % 3)}/${100 + i}`, medium: 'English' },
      { studentId: s.id, level: 'secondary', institution: `Government High School ${i + 1}`, board: 'Karnataka SSLC', passingYear: 2020 + (s.term > 4 ? 0 : 1), percentage: (60 + r.next() * 35).toFixed(2), medium: i % 4 === 0 ? 'Kannada' : 'English' },
    ]),
    { returning: false },
  );
  const lastSection = c.sections[c.sections.length - 1];
  const deferred = lastSection?.students[lastSection.students.length - 1];
  if (deferred) {
    await k.q("update students set status = 'deferred', status_changed_at = now() where id = $1", [deferred.id]);
    await k.ins(
      'student_lifecycle_events',
      [{ studentId: deferred.id, kind: 'status', fromStatus: 'enrolled', toStatus: 'deferred', reason: 'Family relocating this year; joins the next intake', effectiveOn: c.today, returnOn: addDays(c.today, 150), approverId: principal, actorId: principal }],
      { returning: false },
    );
  }

  // ---- calendars: fed from admissions and exams, a campus entry and a class entry ----
  // The services that opened cycles and published results during the seed already fed some entries; replace them with one complete set.
  await k.q('delete from calendar_events where tenant_id = $1 and source is not null', [c.tenantId]);
  const feed: Record<string, unknown>[] = [];
  for (const cy of await k.q<{ id: string; name: string; opensOn: string; closesOn: string }>("select id, name, opens_on::text as opens_on, closes_on::text as closes_on from admission_cycles where tenant_id = $1 and status <> 'draft'", [c.tenantId])) {
    feed.push({ kind: 'event', title: `Admissions open: ${cy.name}`, startsOn: cy.opensOn, endsOn: cy.closesOn, source: 'admissions', sourceRef: `cycle:${cy.id}`, createdBy: principal });
  }
  for (const s of await k.q<{ id: string; name: string; startsOn: string; endsOn: string; publishedAt: string | null }>("select id, name, starts_on::text as starts_on, ends_on::text as ends_on, published_at::text as published_at from exam_sessions where tenant_id = $1 and status <> 'draft'", [c.tenantId])) {
    feed.push({ kind: 'exam', title: s.name, startsOn: s.startsOn, endsOn: s.endsOn, source: 'exams', sourceRef: `session:${s.id}`, createdBy: principal });
    if (s.publishedAt) feed.push({ kind: 'event', title: `Results published: ${s.name}`, startsOn: s.publishedAt.slice(0, 10), endsOn: s.publishedAt.slice(0, 10), source: 'exams', sourceRef: `result:${s.id}`, createdBy: principal });
  }
  const bcm3 = c.sections.find((s) => s.prog === 'BCM' && s.term === 3) ?? c.sections[0];
  feed.push({ kind: 'event', title: 'Main campus: technology week', startsOn: addDays(c.today, 12), endsOn: addDays(c.today, 14), campusIds: [c.campusId], createdBy: principal });
  if (bcm3) feed.push({ kind: 'event', title: `${bcm3.label}: industry visit`, startsOn: addDays(c.today, 9), endsOn: addDays(c.today, 9), sectionIds: [bcm3.id], createdBy: principal });
  await k.ins('calendar_events', feed, { returning: false });

  // ---- timetable: subject frequency; faculties and frameworks ----
  const ruled = c.sections.filter((s) => (s.prog === 'BCM' || s.prog === 'BCA') && s.term === 3);
  const subjectIds = [...new Set(ruled.flatMap((s) => s.subjects.map((x) => x.id)))];
  await k.ins('subject_frequency', subjectIds.map((id) => ({ subjectId: id, minPerWeek: 3, maxPerWeek: 6, maxPerDay: 2 })), { returning: false });
  const fw = await k.ins<{ id: string }>('curriculum_frameworks', [
    { code: 'NEP2020', name: 'National Education Policy 2020', kind: 'national', authority: 'Ministry of Education, Government of India', description: 'Credit-based, multidisciplinary undergraduate framework.' },
    { code: 'KSHEC-NEP', name: 'Karnataka State NEP curriculum framework', kind: 'state', authority: 'Karnataka State Higher Education Council', description: 'State guidance on NEP programmes and credits.' },
  ]);
  await k.q('update regulations set framework_id = $2 where tenant_id = $1', [c.tenantId, fw[0].id]);
  const fac = await k.ins<{ id: string }>('faculties', [
    { code: 'COM', name: 'Faculty of Commerce and Management', kind: 'faculty', deanUserId: c.byEmail['hod.commerce']?.id ?? principal },
    { code: 'CAV', name: 'School of Computing and Aviation', kind: 'school', deanUserId: principal },
  ]);
  const place: [string, number][] = [['Commerce', 0], ['Management Studies', 0], ['Computer Applications', 1], ['Aviation Studies', 1]];
  for (const [dept, i] of place) if (c.departments[dept]) await k.q('update departments set faculty_id = $2 where id = $1', [c.departments[dept], fac[i].id]);
  await k.ins('student_biometric_ids', c.students.slice(0, 40).map((s) => ({ studentId: s.id, deviceUserId: `SIMS-${s.rollNo}` })), { returning: false });

  // ---- learning support: outcomes, mastery, worksheets, extra help, readiness, promotion ----
  const sec = bcm3;
  if (sec && sec.subjects.length >= 2 && sec.students.length) {
    const outs = await k.ins<{ id: string; subjectName: string }>(
      'learning_outcomes',
      sec.subjects.slice(0, 2).flatMap((s, i) => [1, 2].map((n) => ({ kind: 'outcome', grade: sec.term, subjectName: s.name, code: `LO${i + 1}.${n}`, statement: n === 1 ? `Explain the core concepts of ${s.name}` : `Apply ${s.name} methods to a short case` }))),
    );
    const topics = await k.q<{ id: string }>('select id from topics where tenant_id = $1 or tenant_id is null order by id limit 4', [c.tenantId]);
    if (topics.length >= 2) await k.ins('outcome_topics', [{ outcomeId: outs[0].id, topicId: topics[0].id }, { outcomeId: outs[0].id, topicId: topics[1].id }], { returning: false });
    const level = (ability: number) => (ability > 0.8 ? 'mastery' : ability > 0.6 ? 'proficient' : ability > 0.4 ? 'developing' : 'beginning');
    await k.ins('mastery_records', sec.students.flatMap((st) => outs.map((o) => ({ studentId: st.id, outcomeId: o.id, level: level(st.ability + (r.next() - 0.5) * 0.2), evidence: 'Class activity and worksheet', assessedBy: teacher.id, assessedOn: addDays(c.today, -r.int(3, 20)) }))), { returning: false });
    const ws = await k.ins<{ id: string; maxScore: string; levels: string[] }>('worksheets', [
      { kind: 'worksheet', title: `${sec.subjects[0].name}: practice sheet 1`, instructions: 'Attempt all questions and show working.', sectionId: sec.id, subjectName: sec.subjects[0].name, outcomeId: outs[0].id, dueOn: addDays(c.today, -5), maxScore: 20, createdBy: teacher.id },
      { kind: 'activity', title: `${sec.subjects[1].name}: case role play`, instructions: 'Groups of four; each takes a role.', sectionId: sec.id, subjectName: sec.subjects[1].name, outcomeId: outs[2].id, dueOn: addDays(c.today, 3), maxScore: 4, levels: J(['Mastered', 'Secure', 'Developing', 'Beginning']), createdBy: teacher.id },
      { kind: 'reading', title: 'Reading: an annual report extract', instructions: 'Read pages 4 to 9 and note three observations.', sectionId: sec.id, subjectName: sec.subjects[0].name, dueOn: addDays(c.today, 6), maxScore: 10, createdBy: teacher.id },
    ]);
    const levels = ['Mastered', 'Secure', 'Developing', 'Beginning'];
    await k.ins(
      'worksheet_scores',
      sec.students.flatMap((st) => [
        { worksheetId: ws[0].id, studentId: st.id, score: Math.round(Math.min(1, Math.max(0.1, st.ability + (r.next() - 0.5) * 0.3)) * 20), remarks: '', scoredBy: teacher.id },
        { worksheetId: ws[1].id, studentId: st.id, level: levels[Math.min(3, Math.max(0, Math.round((1 - st.ability) * 3)))], remarks: '', scoredBy: teacher.id },
      ]),
      { returning: false },
    );
    const weak = [...sec.students].sort((a, b) => a.ability - b.ability).slice(0, 5);
    await k.ins(
      'remedial_plans',
      [
        ...weak.map((st, i) => ({ studentId: st.id, sectionId: sec.id, subjectName: outs[0].subjectName, source: 'low_mastery', outcomeId: outs[0].id, plan: `Re-teach and practise ${outs[0].subjectName}: core concepts, with two short exercises a week`, assignedTo: teacher.id, dueOn: addDays(c.today, 10 + i), status: i === 0 ? 'closed' : i === 1 ? 'in_progress' : 'open', resultNote: i === 0 ? 'Scored 15 of 20 on the check sheet' : null, createdBy: teacher.id, closedAt: i === 0 ? new Date() : null })),
        { sectionId: sec.id, subjectName: sec.subjects[0].name, source: 'delayed_topic', plan: `Catch up on the second unit of ${sec.subjects[0].name}: planned two weeks ago and not yet taught`, assignedTo: sec.subjects[0].teacherId, dueOn: addDays(c.today, 7), createdBy: principal },
      ],
      { returning: false },
    );
    const final = c.students.filter((s) => s.prog !== 'BCA' && s.term >= 5).slice(0, 10);
    await k.ins('readiness_targets', final.map((s) => ({ studentId: s.id, exam: 'KMAT', examOn: addDays(c.today, 90), targetPct: 65 })), { returning: false });
    await k.ins(
      'readiness_mocks',
      final.flatMap((s) => [-60, -30, -7].map((d, n) => ({ studentId: s.id, exam: 'KMAT', takenOn: addDays(c.today, d), score: Math.round((35 + s.ability * 40 + n * 5 + r.next() * 6) * 2), maxScore: 200, breakdown: J({ 'Quantitative aptitude': Math.round(35 + s.ability * 45 + r.next() * 10), 'Verbal ability': Math.round(40 + s.ability * 40 + r.next() * 10), 'Logical reasoning': Math.round(38 + s.ability * 42 + r.next() * 10) }) }))),
      { returning: false },
    );
    const rule = await k.one<{ id: string }>('promotion_rules', { name: 'Default rule: 75% attendance, 40% in each paper', minAttendancePct: 75, subjectPassPct: 40, maxCompartmentSubjects: 2, graceMarks: 2, isDefault: true });
    await k.ins(
      'promotion_decisions',
      sec.students.slice(0, 10).map((st, i) => {
        const bad = st.presence < 0.8;
        const decision = bad ? 'detained' : st.ability < 0.35 ? 'compartment' : 'promoted';
        return { academicYearId: c.years.cur, studentId: st.id, ruleId: rule.id, decision, failedSubjects: J(decision === 'compartment' ? [sec.subjects[0].name] : []), attendancePct: (st.presence * 100).toFixed(2), reasons: J(bad ? [`Attendance ${(st.presence * 100).toFixed(0)}% is below the required 75%`] : decision === 'compartment' ? [`Below 40% in: ${sec.subjects[0].name}`] : []), status: i < 6 ? 'approved' : 'pending', decidedBy: i < 6 ? principal : null, decidedAt: i < 6 ? new Date() : null };
      }),
      { returning: false },
    );
    const plans = await k.q<{ id: string }>('select id from lesson_plans where tenant_id = $1 and section_id = $2 order by date limit 3', [c.tenantId, sec.id]);
    await k.ins('lesson_plan_outcomes', plans.map((p, i) => ({ lessonPlanId: p.id, learningOutcomeId: outs[i % outs.length].id, activity: 'Think-pair-share on a short case', resource: 'Textbook chapter and slides', assessment: 'Two-question exit ticket' })), { returning: false });
  }

  // ---- forums, rubrics, reattempts and integrity ----
  const [course] = await k.q<{ id: string; sectionId: string }>('select id, section_id from lms_courses where tenant_id = $1 order by created_at limit 1', [c.tenantId]);
  if (course) {
    const asker = c.students.find((s) => s.sectionId === course.sectionId && s.userId);
    const th = await k.ins<{ id: string }>('forum_threads', [
      { courseId: course.id, authorId: teacher.id, title: 'Welcome: how to use this space', body: 'Ask questions about the unit here. Be kind and show your working.', pinned: true },
      { courseId: course.id, authorId: asker?.userId ?? teacher.id, title: 'Doubt about the second unit', body: 'Can someone explain the worked example from class?' },
    ]);
    await k.ins('forum_posts', [{ threadId: th[1].id, authorId: teacher.id, body: 'Start from the definition, then follow the three steps on the slide. Post what you get.' }, { threadId: th[1].id, authorId: asker?.userId ?? teacher.id, body: 'Got it. The second step was the part I missed.' }], { returning: false });
  }
  const rub = await k.ins<{ id: string }>('rubrics', [
    { name: 'Practical record', scope: 'practical', criteria: J([{ name: 'Method', levels: [{ label: 'Complete', points: 4, descriptor: 'All steps shown' }, { label: 'Partial', points: 2, descriptor: 'Some steps missing' }, { label: 'Weak', points: 0, descriptor: 'Little evidence' }] }, { name: 'Accuracy', levels: [{ label: 'Accurate', points: 4, descriptor: 'No errors' }, { label: 'Minor errors', points: 2, descriptor: 'A few slips' }, { label: 'Major errors', points: 0, descriptor: 'Wrong result' }] }, { name: 'Presentation', levels: [{ label: 'Neat', points: 2, descriptor: 'Clear and tidy' }, { label: 'Untidy', points: 0, descriptor: 'Hard to read' }] }]), createdBy: principal },
    { name: 'Viva voce', scope: 'viva', criteria: J([{ name: 'Understanding', levels: [{ label: 'Deep', points: 5, descriptor: 'Explains why' }, { label: 'Adequate', points: 3, descriptor: 'Explains what' }, { label: 'Limited', points: 1, descriptor: 'Recalls only' }] }, { name: 'Communication', levels: [{ label: 'Clear', points: 3, descriptor: 'Confident and clear' }, { label: 'Hesitant', points: 1, descriptor: 'Unsure' }] }]), createdBy: principal },
  ]);
  const scored = c.students.slice(0, 6);
  await k.ins('rubric_scores', scored.map((s, i) => ({ rubricId: rub[0].id, studentId: s.id, contextKind: 'practical', selections: J([i % 3, (i + 1) % 3, i % 2]), total: [4, 2, 0][i % 3] + [4, 2, 0][(i + 1) % 3] + [2, 0][i % 2], maxTotal: 10, scoredBy: teacher.id })), { returning: false });
  const [scheme] = await k.q<{ id: string }>('select id from assessment_schemes where tenant_id = $1 order by created_at limit 1', [c.tenantId]);
  if (scheme) {
    await k.q('update assessment_schemes set max_attempts = 2 where id = $1', [scheme.id]);
    await k.ins('reattempt_requests', scored.slice(0, 3).map((s, i) => ({ studentId: s.id, schemeId: scheme.id, attemptNo: 2, reason: ['Hospitalised during the exam week', 'Clash with the state sports meet', 'Family bereavement'][i], status: ['pending', 'approved', 'rejected'][i], decidedBy: i === 0 ? null : principal, decidedAt: i === 0 ? null : new Date(), decisionNote: i === 1 ? 'Medical certificate seen' : i === 2 ? 'No supporting document' : null })), { returning: false });
  }
  const flagged = c.students.slice(6, 11);
  await k.ins(
    'integrity_flags',
    [
      { studentId: flagged[0].id, contextKind: 'online_exam', kind: 'tab_switch', severity: 'medium', details: J({ times: 7 }), status: 'open' },
      { studentId: flagged[1].id, contextKind: 'online_exam', kind: 'copy_paste', severity: 'medium', details: J({ at: 'question 4' }), status: 'open' },
      { studentId: flagged[2].id, contextKind: 'assignment', kind: 'plagiarism_match', severity: 'high', details: J({ with: flagged[3].id, score: 0.82 }), status: 'confirmed', reviewedBy: principal, reviewedAt: new Date(), reviewNote: 'Same wording in three answers; counselled and marked zero for the answers.' },
      { studentId: flagged[3].id, contextKind: 'assignment', kind: 'plagiarism_match', severity: 'high', details: J({ with: flagged[2].id, score: 0.82 }), status: 'confirmed', reviewedBy: principal, reviewedAt: new Date(), reviewNote: 'Same wording in three answers; counselled and marked zero for the answers.' },
      { studentId: flagged[4].id, contextKind: 'online_exam', kind: 'fullscreen_exit', severity: 'low', details: J({ times: 2 }), status: 'dismissed', reviewedBy: principal, reviewedAt: new Date(), reviewNote: 'Browser update prompt, not misconduct.' },
    ],
    { returning: false },
  );

  // ---- question bank: knowledge levels, tags and the new question types ----
  await k.q(
    `update qb_questions set k_level = case bloom when 'remember' then 'K1' when 'understand' then 'K2' when 'apply' then 'K3' when 'analyze' then 'K4' when 'evaluate' then 'K5' else 'K6' end,
       competency_tags = '["Subject knowledge"]'::jsonb, skill_tags = case when bloom in ('apply', 'analyze') then '["Problem solving"]'::jsonb else '[]'::jsonb end where tenant_id = $1`,
    [c.tenantId],
  );
  const [bank] = await k.q<{ subjectId: string; topic: string; coId: string | null }>('select subject_id, topic, co_id from qb_questions where tenant_id = $1 order by created_at limit 1', [c.tenantId]);
  if (bank) {
    await k.ins(
      'qb_questions',
      [
        { subjectId: bank.subjectId, topic: bank.topic, coId: bank.coId, bloom: 'understand', difficulty: 'easy', marks: 4, type: 'matching', text: 'Match each term with its meaning.', options: J([]), answer: '', kLevel: 'K2', competencyTags: J(['Subject knowledge']), skillTags: J(['Recall']), typeConfig: J({ pairs: [{ left: 'Debit', right: 'Left side of an account' }, { left: 'Credit', right: 'Right side of an account' }, { left: 'Ledger', right: 'Book of accounts' }, { left: 'Journal', right: 'Book of original entry' }] }), status: 'approved', authorId: teacher.id },
        { subjectId: bank.subjectId, topic: bank.topic, coId: bank.coId, bloom: 'analyze', difficulty: 'medium', marks: 10, type: 'case_study', text: 'Read the case and answer the parts.', options: J([]), answer: '', kLevel: 'K4', competencyTags: J(['Subject knowledge', 'Analysis']), skillTags: J(['Problem solving']), typeConfig: J({ passage: 'A company issued 10,000 shares of Rs 10 each at a premium of Rs 2 and received the full amount with applications. Applications were received for 14,000 shares and the rest were refunded.', subQuestions: [{ text: 'Pass the journal entries for the receipt and the allotment.', marks: 6 }, { text: 'State the amount refunded and the premium collected.', marks: 4 }] }), status: 'approved', authorId: teacher.id },
        { subjectId: bank.subjectId, topic: bank.topic, coId: bank.coId, bloom: 'apply', difficulty: 'medium', marks: 10, type: 'practical_rubric', text: 'Post the transactions to the ledger and balance the accounts.', options: J([]), answer: '', kLevel: 'K3', competencyTags: J(['Practical skill']), skillTags: J(['Record keeping']), typeConfig: J({ rubricId: rub[0].id }), status: 'approved', authorId: teacher.id },
      ],
      { returning: false },
    );
  }

  // ---- course registration: a fee on one course, audit course outside the credit limit, a custom allocation window ----
  await k.q("update course_offerings set fee_paise = $2 where id = (select id from course_offerings where tenant_id = $1 and category = 'skill' order by created_at limit 1)", [c.tenantId, rupees(1500)]);
  await k.q("update registration_windows set allocation_rule = 'custom', rule_config = $2::jsonb where id = (select id from registration_windows where tenant_id = $1 order by opens_at desc limit 1)", [c.tenantId, JSON.stringify({ cgpa: 50, attendance: 30, priority: 20 })]);

  // ---- board profile: teachers' training requests (Schedule a Training on the board; the ERP lists and answers them) ----
  const slot = (days: number, hour: number) => new Date(Date.UTC(2026, 9, 12 + days, hour - 6, 30)).toISOString(); // hour in IST
  await k.ins(
    'training_requests',
    [
      { requestedBy: c.teachers[0].id, slotAt: slot(1, 10), topic: 'Smart board basics: pens, shapes and saving a class', status: 'confirmed', adminNote: 'Seminar hall, 10:00 with the IT team.' },
      ...(c.teachers[1] ? [{ requestedBy: c.teachers[1].id, slotAt: slot(2, 14), topic: 'Using the buzzer and quiz tools with students', status: 'requested', adminNote: '' }] : []),
    ],
    { returning: false },
  );
}
