/**
 * Samples for migration 0119: project workspace and impact, careers (resumes, aptitude, paths, mock interviews),
 * internship attendance, thesis and datasets, alumni stories, club posts and achievements, committee evidence,
 * event gallery, a recurring survey with two closed cycles, grievance and discipline records, retention rules,
 * the communication engine and the parent visibility switches. Reads what earlier stages created.
 */
import { ObjectStorage, bufferStream } from '../../storage/storage.service.js';
import type { Ctx, StudentRef } from './ctx.js';
import { J, addDays, at } from './kit.js';
import { service } from './nest.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export async function pathwaySamples(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;
  const withLogin = c.students.filter((s): s is StudentRef & { userId: string } => !!s.userId);
  const sample = (n: number) => c.students.filter((_, i) => i % Math.max(1, Math.floor(c.students.length / n)) === 0).slice(0, n);

  // ---- project workspace --------------------------------------------------------------------------
  const projects = await k.q<{ id: string; title: string; piUserId: string }>('select id, title, pi_user_id from research_projects where tenant_id = $1 order by code', [c.tenantId]);
  const capstone = projects[3] ?? projects[projects.length - 1];
  if (capstone) {
    const team = sample(3);
    for (const s of team) await k.q(`insert into project_members (tenant_id, project_id, student_id, role) select $1,$2,$3,'student' where not exists (select 1 from project_members where project_id = $2 and student_id = $3)`, [c.tenantId, capstone.id, s.id]);
    await k.ins('project_hub', projects.slice(0, 3).map((p, i) => ({ projectId: p.id, showcase: i < 2, summary: ['How small retailers adopt UPI, from a 300 shop survey.', 'A low-code inventory tool built with three MSME partners.', ''][i], recruiting: i === 1 || p.id === capstone.id, lookingFor: J(i === 1 ? ['Excel', 'inventory', 'SQL'] : ['data analysis', 'communication']), openings: i === 1 ? 2 : 1 })), { returning: false });
    await k.ins('project_files', [
      { projectId: capstone.id, title: 'Project charter', kind: 'link', url: 'https://example.org/soundarya/charter', uploadedBy: capstone.piUserId },
      { projectId: capstone.id, title: 'Survey questionnaire', kind: 'link', url: 'https://example.org/soundarya/questionnaire', uploadedBy: capstone.piUserId },
    ], { returning: false });
    const asked = await k.one<{ id: string }>('project_comments', { projectId: capstone.id, authorUserId: capstone.piUserId, body: 'Please add the bus-stop counts for the morning shift before Friday.', createdAt: at(addDays(c.today, -6), '11:00') });
    await k.ins('project_comments', [{ projectId: capstone.id, authorUserId: capstone.piUserId, parentId: asked.id, body: 'Counts for Gate 2 and Gate 3 are in the questionnaire sheet.', createdAt: at(addDays(c.today, -5), '09:30') }], { returning: false });
    await k.ins('project_reviews', [{ projectId: capstone.id, reviewerUserId: capstone.piUserId, kind: 'mentor', rubric: J({ 'Problem framing': 4, Method: 3, 'Data quality': 4, Presentation: 3 }), maxPerCriterion: 5, total: 14, percent: 70, comment: 'Good start; tighten the sampling plan.' }], { returning: false });
    await k.ins('project_vivas', [{ projectId: capstone.id, scheduledAt: at(addDays(c.today, 12), '14:00'), venue: 'Seminar Hall', panel: J([{ userId: capstone.piUserId, name: 'Project mentor' }]), createdBy: capstone.piUserId }], { returning: false });
    const joiner = c.students.find((s) => !team.includes(s));
    if (joiner) await k.ins('project_join_requests', [{ projectId: capstone.id, studentId: joiner.id, message: 'I have done the data cleaning for the college canteen survey.' }], { returning: false });
  }
  await k.ins('portfolio_items', sample(6).flatMap((s, i) => [
    { studentId: s.id, title: 'Inter-college quiz, 2nd place', summary: 'Represented the college in the commerce quiz.', kind: 'work', published: i % 2 === 0 },
    { studentId: s.id, title: 'Market survey report', summary: 'Retail pricing survey of 40 shops.', kind: 'project', published: true, projectId: i === 0 && capstone ? capstone.id : null },
  ]), { returning: false });

  // ---- impact framework ----------------------------------------------------------------------------------
  const fw = await k.one<{ id: string }>('impact_frameworks', { code: 'SIMS-CIF', name: 'Community impact framework', description: 'What our students and projects give back to the neighbourhood.', indicators: J([{ code: 'HH', name: 'Households reached', unit: 'households' }, { code: 'HRS', name: 'Volunteer hours', unit: 'hours' }, { code: 'WKS', name: 'Workshops held', unit: 'workshops' }, { code: 'SHG', name: 'Self-help groups trained', unit: 'groups' }]) });
  await k.ins('impact_records', [
    { frameworkId: fw.id, indicatorCode: 'HH', subjectKind: 'project', subjectRef: capstone?.title ?? 'Capstone', quantity: 120, note: 'Bus-stop survey households', recordedOn: addDays(c.today, -20), recordedBy: principal },
    { frameworkId: fw.id, indicatorCode: 'HRS', subjectKind: 'club_activity', subjectRef: 'NSS camp', quantity: 640, recordedOn: addDays(c.today, -35), recordedBy: principal },
    { frameworkId: fw.id, indicatorCode: 'WKS', subjectKind: 'event', subjectRef: 'Digital payments clinic', quantity: 4, recordedOn: addDays(c.today, -15), recordedBy: principal },
    { frameworkId: fw.id, indicatorCode: 'SHG', subjectKind: 'event', subjectRef: 'Digital payments clinic', quantity: 6, recordedOn: addDays(c.today, -15), recordedBy: principal },
  ], { returning: false });

  // ---- careers ----------------------------------------------------------------------------------------------
  const skillsPool = ['Excel', 'Tally', 'GST filing', 'SQL', 'Python', 'Communication', 'Data analysis', 'Presentation'];
  await k.ins('student_resumes', sample(14).map((s, i) => ({
    studentId: s.id,
    headline: `${c.sections.find((x) => x.id === s.sectionId)?.def.name ?? 'Degree'} student`,
    summary: 'Careful with numbers and keen to learn on the job.',
    education: J([{ institution: 'Soundarya Institute of Management and Science', degree: c.sections.find((x) => x.id === s.sectionId)?.def.name ?? 'Degree', years: '2024-2027' }]),
    experience: J(i % 3 === 0 ? [{ org: 'Local accounting firm', role: 'Summer intern', years: '2026', detail: 'Posted ledgers and reconciled bank statements.' }] : []),
    projects: J([{ title: 'Retail pricing survey', detail: 'Surveyed 40 shops and presented findings.' }]),
    skills: J([skillsPool[i % skillsPool.length], skillsPool[(i + 3) % skillsPool.length], 'Communication']),
    interests: J([i % 2 === 0 ? 'finance' : 'technology']),
    links: J([]),
    visibleToRecruiters: i % 5 !== 4,
  })), { returning: false });
  const test = await k.one<{ id: string }>('aptitude_tests', {
    title: 'Campus screening: reasoning and numbers', category: 'mixed', durationMin: 30, passPercent: 50, createdBy: principal,
    questions: J([
      { prompt: 'A shop gives 20% off a Rs. 500 item. What is the price?', options: ['Rs. 380', 'Rs. 400', 'Rs. 420'], answerIndex: 1, topic: 'Quant' },
      { prompt: 'Next in the series 3, 6, 12, 24?', options: ['30', '36', '48'], answerIndex: 2, topic: 'Logic' },
      { prompt: 'Choose the word closest in meaning to "prudent".', options: ['careless', 'careful', 'loud'], answerIndex: 1, topic: 'Verbal' },
      { prompt: 'If 5 workers finish a job in 12 days, how many days do 10 workers need?', options: ['6', '8', '24'], answerIndex: 0, topic: 'Quant' },
      { prompt: 'All clerks are graduates. Some graduates are cashiers. Which must be true?', options: ['All cashiers are clerks', 'Some graduates are clerks', 'No clerk is a cashier'], answerIndex: 1, topic: 'Logic' },
    ]),
  });
  await k.ins('aptitude_attempts', sample(8).map((s, i) => ({ testId: test.id, studentId: s.id, answers: J([1, 2, 1, i % 2 === 0 ? 0 : 1, 1]), score: i % 2 === 0 ? 5 : 4, total: 5, percent: i % 2 === 0 ? 100 : 80, passed: true, topicScores: J({ Quant: { right: 2, total: 2 }, Logic: { right: 2, total: 2 }, Verbal: { right: 1, total: 1 } }), startedAt: at(addDays(c.today, -9 + (i % 3)), '10:00'), submittedAt: at(addDays(c.today, -9 + (i % 3)), '10:22') })), { returning: false });
  await k.ins('career_paths', [
    { title: 'Accountant', family: 'Finance', description: 'Books, GST and audit support for firms and businesses.', requiredSkills: J(['Excel', 'Tally', 'GST filing']), roles: J(['Junior accountant', 'GST executive']), steps: J([{ title: 'Learn Tally Prime', detail: 'A short certified course.' }, { title: 'File GST returns for a small firm', detail: 'Through an internship.' }]) },
    { title: 'Data analyst', family: 'Technology', description: 'Turn records into decisions with spreadsheets and SQL.', requiredSkills: J(['SQL', 'Excel', 'Data analysis']), roles: J(['Business analyst', 'MIS executive']), steps: J([{ title: 'Learn SQL', detail: 'Practice on public datasets.' }]) },
    { title: 'Software developer', family: 'Technology', description: 'Build and maintain business software.', requiredSkills: J(['Python', 'SQL']), roles: J(['Trainee engineer']), steps: J([]) },
    { title: 'Marketing executive', family: 'Management', description: 'Plan campaigns and talk to customers.', requiredSkills: J(['Communication', 'Presentation', 'Data analysis']), roles: J(['Marketing trainee']), steps: J([]) },
  ], { returning: false });
  const mocker = sample(3);
  for (const [i, s] of mocker.entries()) {
    await k.ins('mock_interviews', [{ studentId: s.id, kind: ['hr', 'technical', 'communication'][i], role: 'Trainee', questions: J([{ prompt: 'Tell me about yourself.', keywords: ['studying', 'project', 'skills'] }]), answers: J([{ answer: 'I am a final year student who built a pricing survey project and I enjoy working with numbers and teams.', seconds: 35 }]), feedback: J({ perQuestion: [{ score: 6.4, notes: ['Add a specific example to back up your point.'] }], overall: ['Decent. Work on examples and structure (situation, action, result).'] }), score: 6.4, status: 'completed', completedAt: at(addDays(c.today, -4), '16:00') }], { returning: false });
  }

  // ---- internships: attendance and what they count towards --------------------------------------------------------
  const interns = await k.q<{ id: string; startsOn: string; endsOn: string }>(`select id, starts_on, ends_on from internships where tenant_id = $1 and status in ('ongoing','completed') limit 6`, [c.tenantId]);
  for (const i of interns) {
    const days: string[] = [];
    for (let d = i.startsOn; d <= (i.endsOn < c.today ? i.endsOn : addDays(c.today, -1)) && days.length < 25; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() % 6 !== 0) days.push(d);
    await k.ins('internship_attendance', days.map((d, n) => ({ internshipId: i.id, onDate: d, present: n % 9 !== 8, hours: n % 9 !== 8 ? 8 : 0 })), { returning: false });
  }
  const someSkill = await k.q<{ id: string }>('select id from skills where tenant_id = $1 limit 2', [c.tenantId]);
  const someSubject = c.sections[0]?.subjects[0];
  if (interns[0] && someSkill[0]) await k.ins('internship_links', [{ internshipId: interns[0].id, kind: 'skill', skillId: someSkill[0].id, note: 'Practised during the internship' }, ...(someSubject ? [{ internshipId: interns[0].id, kind: 'course', subjectId: someSubject.id, note: `Applies ${someSubject.name}` }] : [])], { returning: false });

  // ---- research: supervisors, theses, datasets -------------------------------------------------------------------------
  const scholars = await k.q<{ id: string; supervisorUserId: string; thesisTitle: string | null; fullName: string }>('select id, supervisor_user_id, thesis_title, full_name from research_scholars where tenant_id = $1', [c.tenantId]);
  for (const sup of new Set(scholars.map((x) => x.supervisorUserId))) await k.ins('supervisor_capacity', [{ userId: sup, maxScholars: 6, areas: J(['digital payments', 'MSME finance']) }], { returning: false });
  for (const [i, sc] of scholars.entries()) {
    const stage = ['draft', 'synopsis', 'submitted'][i % 3];
    const th = await k.one<{ id: string }>('thesis_records', { scholarId: sc.id, title: sc.thesisTitle ?? `Thesis of ${sc.fullName}`, stage, abstract: 'A field study of how small businesses adopt digital payments.', contentText: 'This thesis studies how small retailers adopt digital payments. We surveyed shopkeepers in North Bengaluru and compared their daily records with bank deposits to understand the barriers.', submittedOn: stage === 'submitted' ? addDays(c.today, -10) : null, examiners: J(stage === 'submitted' ? [{ name: 'Prof. R. Iyer', affiliation: 'IIM Bangalore' }, { name: 'Dr. S. Menon', affiliation: 'University of Calicut' }] : []) });
    await k.ins('thesis_events', [{ thesisId: th.id, stage: 'synopsis', note: 'Thesis record opened', actorId: sc.supervisorUserId }, ...(stage !== 'synopsis' ? [{ thesisId: th.id, stage, note: '', actorId: sc.supervisorUserId }] : [])], { returning: false });
    await k.ins('supervisor_allocations', [{ scholarId: sc.id, supervisorUserId: sc.supervisorUserId, role: 'supervisor', allocatedOn: '2025-01-10', reason: 'Matches research area' }], { returning: false });
    if (stage === 'submitted') await k.ins('similarity_checks', [{ thesisId: th.id, scorePercent: 11.4, matches: J([]), checkedBy: principal }], { returning: false });
  }
  await k.ins('research_datasets', [
    { title: 'Retail UPI adoption survey 2026 (anonymised)', description: '300 shop responses with village-level codes.', ownerUserId: scholars[0]?.supervisorUserId ?? principal, license: 'CC-BY-4.0', access: 'open', keywords: J(['UPI', 'retail', 'survey']), files: J([]) },
    { title: 'Campus bus ridership counts', description: 'Morning and evening boardings by stop.', ownerUserId: capstone?.piUserId ?? principal, license: 'CC-BY-NC-4.0', access: 'restricted', keywords: J(['transport']), files: J([]) },
    { title: 'Women entrepreneurs interviews', description: 'Transcripts under embargo until the paper is published.', ownerUserId: c.teachers[8].id, license: 'Restricted', access: 'embargoed', embargoUntil: addDays(c.today, 180), keywords: J(['interviews']), files: J([]) },
  ], { returning: false });

  // ---- alumni stories, club posts and achievements -----------------------------------------------------------------
  const alumni = await k.q<{ id: string }>('select id from alumni_profiles where tenant_id = $1 order by graduation_year desc limit 3', [c.tenantId]);
  const storyText = ['The debate club taught me to explain a balance sheet to a farmer, and that is half my job now.', 'My internship at a local firm became my first job; ask your mentors about it early.', 'Draft: I want to write about moving cities for work.'];
  await k.ins('alumni_success_stories', alumni.map((a, i) => ({ alumniId: a.id, title: ['From the debate club to a Big Four desk', 'An internship that became a career', 'Moving cities for work'][i], body: storyText[i], status: ['published', 'submitted', 'draft'][i], featured: i === 0, publishedAt: i === 0 ? at(addDays(c.today, -14), '10:00') : null, reviewedBy: i === 0 ? principal : null })), { returning: false });
  const clubs = await k.q<{ id: string; name: string }>("select c.id, c.name from clubs c where c.tenant_id = $1 and exists (select 1 from club_members m where m.club_id = c.id and m.status in ('active', 'approved')) order by c.name limit 4", [c.tenantId]);
  for (const club of clubs) {
    const members = await k.q<{ studentId: string }>(`select student_id from club_members where club_id = $1 and status in ('active', 'approved') limit 3`, [club.id]);
    await k.ins('club_office_bearers', members.map((m, n) => ({ clubId: club.id, studentId: m.studentId, post: ['President', 'Secretary', 'Treasurer'][n], fromOn: '2026-08-01' })), { returning: false });
    await k.ins('club_achievements', [{ clubId: club.id, title: `${club.name}: inter-college meet`, level: ['institutional', 'district', 'state', 'national'][clubs.indexOf(club)], position: 'Runner-up', achievedOn: addDays(c.today, -25), participants: J(members.map((m) => ({ studentId: m.studentId, name: c.students.find((s) => s.id === m.studentId)?.name ?? '' }))), description: 'Represented the college.', recordedBy: principal }], { returning: false });
  }

  // ---- committee evidence and the event gallery ----------------------------------------------------------------------------
  const committees = await k.q<{ id: string }>('select id from committees where tenant_id = $1 order by name limit 2', [c.tenantId]);
  await k.ins('committee_evidence', committees.flatMap((cm) => [{ committeeId: cm.id, title: 'Signed minutes (scan)', kind: 'document', url: 'https://example.org/soundarya/minutes.pdf', uploadedBy: principal }, { committeeId: cm.id, title: 'Meeting photographs', kind: 'photo', url: 'https://example.org/soundarya/photos', uploadedBy: principal }]), { returning: false });
  const events = await k.q<{ id: string }>('select id from campus_events where tenant_id = $1 order by starts_at limit 2', [c.tenantId]);
  const storage = await service(ObjectStorage);
  for (const [i, ev] of events.entries()) {
    const key = `tenants/${c.tenantId}/events/seed-${i}.png`;
    await storage.put(key, bufferStream(PNG), 1_000_000, 'image/png');
    await k.ins('event_media', [{ eventId: ev.id, caption: 'On the day', kind: 'photo', storageKey: key, contentType: 'image/png', sizeBytes: PNG.length, approved: true, uploadedBy: principal }, { eventId: ev.id, caption: 'Waiting for approval', kind: 'photo', url: 'https://example.org/soundarya/photo.jpg', approved: false, uploadedBy: principal }], { returning: false });
  }

  // ---- a recurring survey with two closed cycles -----------------------------------------------------------------------------
  const staffIds = c.staff.map((s) => s.id).slice(0, 18);
  const cycles = [
    { opens: '2026-02-02', closes: '2026-02-16', scores: [3, 3, 4] },
    { opens: '2026-08-03', closes: '2026-08-17', scores: [4, 3, 5] },
  ];
  for (const [n, cy] of cycles.entries()) {
    const sv = await k.one<{ id: string }>('surveys', { title: 'Staff pulse survey', description: 'Twice a year, three questions.', audience: 'staff', anonymous: true, opensAt: at(cy.opens, '09:00'), closesAt: at(cy.closes, '18:00'), status: 'closed', createdBy: principal, closedAt: at(cy.closes, '18:00'), seriesKey: 'staff-pulse', repeatEveryDays: 180, autoPublish: true });
    const qs = await k.ins<{ id: string }>('survey_questions', [
      { surveyId: sv.id, ord: 1, kind: 'rating', prompt: 'How supported do you feel by your department?', options: J([]), required: true },
      { surveyId: sv.id, ord: 2, kind: 'rating', prompt: 'How reasonable is your workload?', options: J([]), required: true },
      { surveyId: sv.id, ord: 3, kind: 'single', prompt: 'Would you recommend working here?', options: J(['Yes', 'No']), required: true },
    ]);
    for (const [i, uid] of staffIds.entries()) {
      const resp = await k.one<{ id: string }>('survey_responses', { surveyId: sv.id, respondentId: uid });
      void resp;
      await k.ins('survey_answers', [
        { surveyId: sv.id, questionId: qs[0].id, choices: J([]), rating: Math.max(1, Math.min(5, cy.scores[0] + (i % 3) - 1)) },
        { surveyId: sv.id, questionId: qs[1].id, choices: J([]), rating: Math.max(1, Math.min(5, cy.scores[1] + (i % 2) - 1)) },
        { surveyId: sv.id, questionId: qs[2].id, choices: J([i % (n + 4) === 0 ? 'No' : 'Yes']) },
      ], { returning: false });
    }
  }

  // ---- evidence and records on welfare cases ------------------------------------------------------------------------------------
  const tickets = await k.q<{ id: string; raisedBy: string }>('select id, raised_by from grievance_tickets where tenant_id = $1 and committee is null order by created_at limit 2', [c.tenantId]);
  for (const [i, tk] of tickets.entries()) {
    const key = `tenants/${c.tenantId}/grievances/seed-${i}.png`;
    await storage.put(key, bufferStream(PNG), 1_000_000, 'image/png');
    await k.ins('grievance_evidence', [{ ticketId: tk.id, title: 'Screenshot', contentType: 'image/png', sizeBytes: PNG.length, storageKey: key, addedBy: tk.raisedBy }], { returning: false });
  }
  const incidents = await k.q<{ id: string; studentId: string }>('select id, student_id from discipline_incidents where tenant_id = $1 order by incident_on desc limit 3', [c.tenantId]);
  for (const inc of incidents) {
    const mate = c.students.find((s) => s.id !== inc.studentId);
    await k.ins('discipline_witnesses', [{ incidentId: inc.id, name: mate?.name ?? 'Classmate', role: 'student', studentId: mate?.id ?? null, statement: 'I saw it happen near the canteen.', recordedBy: principal }], { returning: false });
    const guardians = c.guardianOf.get(inc.studentId) ?? [];
    await k.ins('discipline_parent_contacts', guardians.slice(0, 1).map((g) => ({ incidentId: inc.id, guardianUserId: g, method: 'meeting', summary: 'Parents called to meet the class teacher.', meetingOn: addDays(c.today, 3), createdBy: principal })), { returning: false });
  }

  // ---- retention, communication and parent visibility --------------------------------------------------------------------------------------------
  await k.ins('data_retention_rules', [
    { target: 'vault_documents', category: 'aadhaar', keepDays: 2555, action: 'archive' },
    { target: 'notifications', category: '', keepDays: 180, action: 'delete' },
    { target: 'career_assistant', category: '', keepDays: 365, action: 'delete' },
  ], { returning: false });
  const [feeT, noticeT] = await k.ins<{ id: string }>('message_templates', [
    { key: 'fee_reminder', channel: 'in_app', locale: 'en', subject: 'Fee reminder', body: 'Dear {{name}}, {{item}} is due on {{date}}. Please pay at the accounts office or online.' },
    { key: 'fee_reminder', channel: 'in_app', locale: 'kn', subject: 'ಶುಲ್ಕ ಜ್ಞಾಪನೆ', body: 'ಆತ್ಮೀಯ {{name}}, {{item}} {{date}} ರಂದು ಬಾಕಿ ಇದೆ.' },
    { key: 'holiday_notice', channel: 'email', locale: 'en', subject: 'Holiday notice', body: 'Dear {{name}}, the college is closed on {{date}}.' },
    { key: 'fee_sms', channel: 'sms', locale: 'en', subject: '', body: 'Fee of Rs {{amount}} is due on {{date}}. - SIMS', dltTemplateId: '1107000000000001234' },
  ]);
  const [aud1, aud2] = await k.ins<{ id: string }>('audience_rules', [
    { name: 'All students', rule: J({ roles: ['student'] }), createdBy: principal },
    { name: 'All teachers', rule: J({ roles: ['teacher'] }), createdBy: principal },
  ]);
  const camp = await k.one<{ id: string }>('message_campaigns', { title: 'November fee reminder', templateId: feeT.id, audienceId: aud1.id, vars: J({ item: 'Semester fee', date: addDays(c.today, 10) }), sendAt: at(addDays(c.today, -3), '09:00'), status: 'sent', recipients: withLogin.length, sentCount: withLogin.length, failedCount: 0, createdBy: principal });
  await k.ins('message_deliveries', withLogin.map((s, i) => ({ campaignId: camp.id, userId: s.userId, channel: 'in_app', status: i % 3 === 0 ? 'read' : 'sent', attempts: 1, sentAt: at(addDays(c.today, -3), '09:00'), readAt: i % 3 === 0 ? at(addDays(c.today, -3), '12:00') : null })), { returning: false });
  await k.ins('message_campaigns', [{ title: 'Holiday notice for staff', templateId: noticeT.id, audienceId: aud2.id, vars: J({ date: addDays(c.today, 14) }), sendAt: at(addDays(c.today, 7), '09:00'), status: 'scheduled', createdBy: principal }], { returning: false });
  await k.ins('parent_visibility', ['attendance', 'diary', 'report_card', 'behaviour', 'activities', 'health'].map((section) => ({ section, visible: true, updatedBy: principal })), { returning: false });
  void r;
}
