/** Accreditation sample: NAAC metric entries, a DVV clarification, IQAC meetings and actions, feedback action taken, best practices, teacher evidence. */
import type { Ctx } from './ctx.js';
import { addDays, J } from './kit.js';

export async function accreditationSamples(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const cycle = '2026-27';
  const principal = c.byEmail.principal.id;
  const entry = (metricCode: string, v: Record<string, unknown>) => ({ body: 'naac', cycle, metricCode, updatedBy: principal, ...v });
  await k.ins(
    'accreditation_entries',
    [
      entry('1.1.1', { textValue: 'Each semester starts from the university calendar. Heads of department prepare teaching plans, the IQAC reviews them, and syllabus coverage is tracked on the smartboards.' }),
      entry('1.1.2', { value: 66.7, dataRows: J([['BCom', 'BCom Honours', '2023', '2025', '100'], ['BCA', 'BCA', '2023', '2025', '100'], ['BBA', 'BBA', '2023', '2023', '0']]) }),
      entry('1.2.2', { value: 6, dataRows: J([['Tally Prime', 'ADD-01', '2026', '40', '52', '48'], ['Spoken English', 'ADD-02', '2026', '30', '60', '55']]) }),
      entry('2.1.2', { value: 92 }),
      entry('2.5.1', { value: 24 }),
      entry('3.7.2', { value: 3, dataRows: J([['Infosys Springboard', 'Training and internships', '2025', '3 years', '120'], ['Local Chamber of Commerce', 'Guest lectures', '2025', '2 years', '80'], ['Bengaluru City University library network', 'Resource sharing', '2024', '5 years', '300']]) }),
      entry('4.1.2', { value: 18.5 }),
      entry('5.2.2', { value: 22 }),
      entry('6.5.2', { selfScore: 3 }),
      entry('7.1.1', { value: 4 }),
    ],
    { returning: false },
  );
  await k.ins('dvv_queries', { cycle, metricCode: '1.1.2', query: 'Share the board of studies minutes that approved the syllabus revisions.', response: 'Minutes of the board of studies meeting are attached as evidence.', status: 'answered', raisedBy: principal, answeredAt: new Date() }, { returning: false });
  const [m1, m2] = await k.ins<{ id: string }>('iqac_meetings', [
    { title: 'IQAC meeting: AQAR data plan', meetingOn: addDays(c.today, -40), agenda: 'AQAR data collection, student feedback, best practices', attendees: 'Principal, IQAC coordinator, heads of department', minutes: 'The coordinator will collect criterion-wise data by the end of the month. Heads of department will upload course files and faculty evidence.', createdBy: principal },
    { title: 'IQAC meeting: feedback review', meetingOn: addDays(c.today, -10), agenda: 'Student satisfaction survey results', attendees: 'Principal, IQAC coordinator, student representatives', minutes: 'Students asked for longer library hours and more lab time. Both were approved.', createdBy: principal },
  ]);
  await k.ins(
    'iqac_actions',
    [
      { meetingId: m1.id, action: 'Collect criterion 3 data from all departments', ownerName: 'IQAC coordinator', dueOn: addDays(c.today, -20), status: 'done', actionTaken: 'All departments submitted data on time.', closedAt: new Date() },
      { meetingId: m1.id, action: 'Write two best practices in the NAAC format', ownerName: 'Principal', dueOn: addDays(c.today, 10), status: 'open' },
      { meetingId: m2.id, action: 'Extend library hours to 7 pm', ownerName: 'Librarian', dueOn: addDays(c.today, -3), status: 'done', actionTaken: 'Library now closes at 7 pm on working days.', closedAt: new Date() },
    ],
    { returning: false },
  );
  await k.ins(
    'iqac_feedback_reports',
    [
      { cycle, stakeholder: 'students', summary: 'Students rate teaching highly (4.2 of 5) but ask for longer library hours and more lab time.', averageRating: 4.2, responses: 180, actionTaken: 'Library hours extended to 7 pm; two extra lab hours added to the timetable.', status: 'action_taken', createdBy: principal },
      { cycle, stakeholder: 'employers', summary: 'Employers value communication skills and ask for more Tally and Excel practice.', averageRating: 3.9, responses: 12, actionTaken: '', status: 'analysed', createdBy: principal },
    ],
    { returning: false },
  );
  await k.ins(
    'iqac_practices',
    [
      { kind: 'best_practice', title: 'Mentoring circles for first-year students', year: cycle, objectives: 'Reduce first-year dropout and help students settle in.', context: 'Many first-year students are first-generation learners from Kannada-medium schools.', practice: 'Each mentor meets ten students every fortnight; risk signals from attendance and marks guide the conversation.', evidence: 'First-year attendance rose and dropouts fell compared with the last cycle.', problems: 'Mentor time is limited during exams.', createdBy: principal },
      { kind: 'distinctiveness', title: 'Smartboard-led teaching in every classroom', year: cycle, objectives: 'Make every class interactive and record what was taught.', context: 'The college serves a neighbourhood with limited access to digital resources.', practice: 'Teachers teach from the board, topics covered are logged, and lessons are available to students afterwards.', evidence: 'Syllabus coverage and lecture recordings are reported by class.', problems: 'Power cuts affect some sessions.', createdBy: principal },
    ],
    { returning: false },
  );
  const teachers = c.teachers.slice(0, 3);
  await k.ins(
    'faculty_evidence',
    teachers.map((t, i) => ({ userId: t.id, kind: ['publication', 'fdp', 'book'][i], title: ['Digital payments among small traders in Bengaluru', 'Faculty development programme on outcome-based education', 'Chapter on cost accounting in an edited volume'][i], year: 2026, venue: ['Journal of Commerce and Management', 'Bengaluru City University', 'Academic Press'][i], verified: i !== 2, verifiedBy: i !== 2 ? principal : null })),
    { returning: false },
  );
}
