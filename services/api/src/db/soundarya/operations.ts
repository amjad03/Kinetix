/** Tasks and approvals, health, notices and messages, welfare and discipline, governance, research, certificates, smartboards, integrations and reports. */
import type { UserPrincipal } from '../../auth/principal.js';
import { ConnectorsService } from '../../connectors/connectors.service.js';
import { WorkflowsService } from '../../workflows/workflows.service.js';
import { bufferStream, ObjectStorage } from '../../storage/storage.service.js';
import { FEMALE, MALE, SURNAMES } from './data.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';
import { service, withTenant } from './nest.js';

const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

export async function tasksAndWorkflows(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal;
  const wf = await service(WorkflowsService);
  const textField = (key: string, label: string, required = true) => ({ key, label, type: 'text', required });
  const defs = await k.ins<{ id: string; requestType: string }>('workflow_definitions', [
    { requestType: 'purchase_approval', name: 'Purchase approval', description: 'For any purchase above the store limit.', fields: J([textField('item', 'Item or service'), { key: 'vendor', label: 'Preferred vendor', type: 'text', required: false }]), steps: J([{ name: 'HoD approval', approver: { kind: 'department_head' }, slaHours: 48 }, { name: 'Principal approval', approver: { kind: 'role', role: 'principal' }, minAmount: 25000, slaHours: 72 }, { name: 'Accounts verification', approver: { kind: 'role', role: 'accountant' }, slaHours: 48 }]), active: true, createdBy: principal.id },
    { requestType: 'event_permission', name: 'Event permission', description: 'Permission to hold a department event or industry visit.', fields: J([textField('event', 'Event'), { key: 'date', label: 'Proposed date', type: 'date', required: true }, { key: 'participants', label: 'Expected participants', type: 'number', required: true }]), steps: J([{ name: 'HoD approval', approver: { kind: 'department_head' }, slaHours: 48 }, { name: 'Principal approval', approver: { kind: 'role', role: 'principal' }, slaHours: 72 }]), active: true, createdBy: principal.id },
    { requestType: 'on_duty', name: 'On-duty request', description: 'Faculty attending a seminar, valuation or training on a working day.', fields: J([textField('purpose', 'Purpose'), { key: 'date', label: 'Date', type: 'date', required: true }]), steps: J([{ name: 'HoD approval', approver: { kind: 'department_head' }, slaHours: 24 }]), active: true, createdBy: principal.id },
  ]);
  void defs;
  const asUser = (u: { id: string }, roles: UserPrincipal['roles']): UserPrincipal => ({ kind: 'user', tenantId: c.tenantId, userId: u.id, roles });
  const teachers = c.teachers.filter((t) => !t.email.startsWith('hod.'));
  const commerce = teachers.filter((t) => t.dept === 'Commerce');
  const comp = teachers.filter((t) => t.dept === 'Computer Applications');
  const mgmt = teachers.filter((t) => t.dept === 'Management Studies');
  const reqs: { who: (typeof teachers)[number]; type: string; title: string; amount?: number; payload: Record<string, unknown>; steps: ('approve' | 'reject' | 'return' | 'cancel')[]; hod: string }[] = [
    { who: comp[0], type: 'purchase_approval', title: '10 new keyboards and mice for Computer Lab 2', amount: 12000, payload: { item: 'USB keyboards and optical mice', vendor: 'Bengaluru Office Solutions' }, steps: ['approve'], hod: 'hod.computers' },
    { who: comp[1], type: 'purchase_approval', title: 'Annual licence: Visual Studio and JetBrains classroom pack', amount: 68000, payload: { item: 'Software licences' }, steps: [], hod: 'hod.computers' },
    { who: commerce[0], type: 'purchase_approval', title: 'Tally Prime educational licences (30 seats)', amount: 54000, payload: { item: 'Tally Prime EDU', vendor: 'Authorised partner, Bengaluru' }, steps: ['approve', 'approve', 'approve'], hod: 'hod.commerce' },
    { who: commerce[1], type: 'event_permission', title: 'Industry visit to a manufacturing unit in Peenya', payload: { event: 'Industry visit for BCom Sem 5', date: addDays(c.today, 21), participants: 45 }, steps: ['approve'], hod: 'hod.commerce' },
    { who: mgmt[0], type: 'event_permission', title: 'Management fest Vyapara: budget and permission', payload: { event: 'Vyapara inter-college fest', date: addDays(c.today, 14), participants: 280 }, steps: ['approve', 'approve'], hod: 'hod.management' },
    { who: mgmt[1], type: 'on_duty', title: 'BCU valuation duty, 14 to 16 October', payload: { purpose: 'Semester valuation at BCU camp', date: addDays(c.today, 5) }, steps: ['approve'], hod: 'hod.management' },
    { who: commerce[2], type: 'on_duty', title: 'FDP on NEP curriculum, Mysuru', payload: { purpose: 'Faculty development programme', date: addDays(c.today, 9) }, steps: ['reject'], hod: 'hod.commerce' },
    { who: comp[2], type: 'event_permission', title: 'Hackathon night in the lab', payload: { event: '12-hour hackathon', date: addDays(c.today, 30), participants: 60 }, steps: ['return'], hod: 'hod.computers' },
    { who: mgmt[2], type: 'purchase_approval', title: 'Case study subscription for MBA', amount: 18000, payload: { item: 'Harvard-style case collection' }, steps: ['cancel'], hod: 'hod.management' },
  ];
  for (const q of reqs) {
    await withTenant(c.tenantId, async (tx) => {
      const req = await wf.start(tx, { tenantId: c.tenantId, requesterId: q.who.id, requestType: q.type, title: q.title, payload: q.payload, amount: q.amount ?? null });
      const approvers = [asUser(c.byEmail[q.hod], ['hod', 'teacher']), asUser(principal, ['principal']), asUser(c.byEmail.accounts, ['accountant'])];
      let step = 0;
      for (const action of q.steps) {
        if (action === 'cancel') await wf.cancel(tx, asUser(q.who, ['teacher']), req.id, 'No longer needed');
        else await wf.decide(tx, approvers[step], req.id, action, action === 'approve' ? 'Approved' : action === 'reject' ? 'Not possible during valuation week' : 'Please add the budget and the supervising faculty.');
        step++;
      }
    });
  }
  // Plain tasks.
  const taskRows = [
    ['Prepare NAAC SSR criterion 2 data', 'principal', 'high', 'open', 20], ['Collect IA 1 marks from all departments', 'hod.commerce', 'urgent', 'in_progress', 2], ['Update CO-PO mapping for BCA Sem 5', 'hod.computers', 'normal', 'open', 12], ['Reconcile hostel mess advance with the register', 'accounts', 'normal', 'in_progress', 6],
    ['Renew bus insurance KA-51-AD-1290', 'transport', 'urgent', 'open', 12], ['Order cricket kits for the sports day', 'stores', 'low', 'open', 35], ['Call parents of students below 75 percent attendance', 'counsellor', 'high', 'in_progress', 4], ['Send alumni meet invitations', 'principal', 'normal', 'done', -3], ['Verify pending bank transfer fee submissions', 'accounts', 'high', 'open', 1], ['Upload December exam timetable to the notice board', 'hod.languages', 'normal', 'done', -1], ['Finalise internship placements for BBA Sem 3', 'placements', 'normal', 'open', 16], ['Cancel duplicate library subscription', 'library', 'low', 'cancelled', 9],
  ];
  await k.ins('tasks', taskRows.map(([title, who, priority, status, due], i) => ({ title, description: 'Created from the weekly staff meeting.', ownerId: principal.id, assigneeId: c.byEmail[who as string].id, dueAt: at(addDays(c.today, due as number), '17:00'), priority, status, sourceModule: i === 6 ? 'mentoring' : null, slaHours: 72, completedAt: status === 'done' ? at(addDays(c.today, -1)) : null, version: 1 })), { returning: false });
  void r;
}

export async function health(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const counsellor = c.byEmail.counsellor.id;
  const list = c.students.filter((_, i) => i % 5 === 2).slice(0, 55);
  await k.ins('health_profiles', list.map((st, i) => ({ studentId: st.id, bloodGroup: ['O+', 'A+', 'B+', 'AB+', 'O-', 'B-'][i % 6], allergies: i % 9 === 0 ? ['Peanuts'] : i % 11 === 0 ? ['Dust', 'Penicillin'] : [], conditions: i % 13 === 0 ? ['Asthma'] : i % 17 === 0 ? ['Type 1 diabetes'] : [], medications: i % 13 === 0 ? ['Salbutamol inhaler (as needed)'] : [], emergencyContacts: J([{ name: `${r.pick(MALE)} ${st.name.split(' ')[1]}`, relation: 'father', phone: `+9190000${80000 + i}` }, { name: `${r.pick(FEMALE)} ${st.name.split(' ')[1]}`, relation: 'mother', phone: `+9190000${81000 + i}` }]), notes: i % 13 === 0 ? 'Inhaler kept with the class mentor.' : '', updatedBy: counsellor })), { returning: false });
  await k.ins('health_vaccinations', list.slice(0, 30).map((st, i) => ({ studentId: st.id, vaccine: ['Hepatitis B', 'MMR', 'COVID-19 booster', 'Tetanus Td'][i % 4], dose: String((i % 3) + 1), givenOn: addDays(c.today, -200 - i * 9), nextDueOn: i % 4 === 3 ? addDays(c.today, 60 + i) : null, notes: null, recordedBy: counsellor })), { returning: false });
  await k.ins('health_visits', list.slice(0, 16).map((st, i) => ({ studentId: st.id, visitedAt: at(addDays(c.today, -(i + 1)), `1${i % 5}:20`), complaint: ['Headache', 'Fever', 'Stomach ache', 'Minor cut on hand', 'Dizziness', 'Sore throat', 'Sprained ankle'][i % 7], action: ['Rest and paracetamol', 'Sent to the doctor', 'ORS and rest', 'First aid, dressing', 'Observed for 30 minutes', 'Warm water, lozenges', 'Ice pack and crepe bandage'][i % 7], sentHome: i % 5 === 1, recordedBy: counsellor })), { returning: false });
}

export async function communication(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;
  const bcast = await k.ins<{ id: string }>('broadcasts', [
    { senderId: principal, title: 'Holiday: Dasara', body: 'The college will remain closed from 19 to 21 October for Mahanavami and Vijayadashami. Classes resume on 22 October.', priority: 'info', audience: J({ all: true }), requiresAck: false, expiresAt: at(addDays(c.today, 10)) },
    { senderId: principal, title: 'Internal Assessment 2 timetable', body: 'IA 2 begins on 16 November. The timetable is on the notice board and in the app. Carry your ID card.', priority: 'important', audience: J({ all: true }), requiresAck: true, expiresAt: at(addDays(c.today, 20)) },
    { senderId: principal, title: 'Heavy rain: early closure today', body: 'Because of the heavy rain warning, classes end at 1 pm today. Buses will leave at 1:30 pm.', priority: 'emergency', audience: J({ all: true }), requiresAck: true, expiresAt: at(addDays(c.today, -20)), clearedAt: at(addDays(c.today, -20), '18:00') },
  ]);
  void bcast;
  // Notices in each family's and student's inbox.
  const guardians = [...new Set([...c.guardianOf.values()].flat())];
  const n: Record<string, unknown>[] = [];
  const users = (await k.q<{ id: string; role: string }>("select distinct on (u.id) u.id, ur.role from users u join user_roles ur on ur.user_id = u.id where u.tenant_id = $1 and ur.role in ('guardian','student','teacher','hod') order by u.id", [c.tenantId]));
  for (const u of users) {
    if (u.role === 'guardian' || u.role === 'student') {
      n.push({ userId: u.id, kind: 'fee', title: 'Fee reminder', body: 'Instalment 2 of the semester tuition fee is due on 10 November. Pay at the accounts counter or by bank transfer.', data: J({ screen: 'fees' }), dedupeKey: `fee:rem:${u.id}`, readAt: r.chance(0.5) ? at(addDays(c.today, -1)) : null });
      n.push({ userId: u.id, kind: 'calendar', title: 'Dasara holidays', body: 'The college is closed from 19 to 21 October.', data: J({}), dedupeKey: `cal:dasara:${u.id}`, readAt: r.chance(0.6) ? at(addDays(c.today, -1)) : null });
    }
    if (u.role === 'student') n.push({ userId: u.id, kind: 'marks', title: 'Marks published', body: 'Model examination results for Semester 3 have been published. Open Results to see your grades.', data: J({}), dedupeKey: `marks:model:${u.id}`, readAt: null });
    if (u.role === 'teacher' || u.role === 'hod') n.push({ userId: u.id, kind: 'task', title: 'IA 2 marks entry opens on 16 November', body: 'Please plan your question papers and submit them to the HoD by 2 November.', data: J({}), dedupeKey: `task:ia2:${u.id}`, readAt: null });
  }
  await k.ins('notifications', n, { returning: false });

  // A parent and a teacher talking about Vignesh and Sahana.
  const vig = c.students.find((s) => s.name === 'Vignesh Naik')!;
  const sah = c.students.find((s) => s.name === 'Sahana Gowda')!;
  const pairs: [typeof vig, string, string][] = [[vig, 'parent.bca', 'sowmya.reddy'], [sah, 'parent.bcom', 'sudhir.kamath']];
  for (const [st, parent, teacher] of pairs) {
    const family = (await k.q<{ id: string }>('select id from users where email = $1', [`${parent}@soundarya.demo.kinetix.in`]))[0].id;
    const conv = await k.one<{ id: string }>('conversations', { studentId: st.id, staffId: c.byEmail[teacher].id, familyId: family, lastMessageAt: at(addDays(c.today, -1), '18:10'), staffReadAt: at(addDays(c.today, -1), '18:15') });
    const low = st.presence < 0.7;
    await k.ins('messages', [
      { conversationId: conv.id, senderId: c.byEmail[teacher].id, body: low ? 'Good evening. Vignesh’s attendance is 66 percent this semester. Is everything fine at home? He needs to be above 75 percent for the exams.' : 'Sahana has done very well in the model exam. She is among the top five in the class.', createdAt: at(addDays(c.today, -2), '17:30') },
      { conversationId: conv.id, senderId: family, body: low ? 'Thank you for informing us. He had dengue last month. We will make sure he attends regularly now. Can he get notes for the days he missed?' : 'Thank you ma’am and sir. We are very happy. We will keep encouraging her.', createdAt: at(addDays(c.today, -1), '18:10') },
    ], { returning: false });
  }
  // Parent-teacher meeting.
  const ptm = await k.one<{ id: string }>('ptm_events', { title: 'Parent-Teacher Meeting: Odd semester 2026', eventDate: addDays(c.today, 12), location: 'Seminar Hall and classrooms', status: 'open', createdBy: principal });
  const slots: Record<string, unknown>[] = [];
  c.teachers.filter((t) => !t.email.startsWith('hod.')).slice(0, 10).forEach((t, ti) => {
    for (let i = 0; i < 6; i++) {
      const start = `${10 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`;
      const st = c.students[(ti * 17 + i * 5) % c.students.length];
      const booked = i < 3 && c.guardianOf.has(st.id);
      slots.push({ eventId: ptm.id, teacherId: t.id, startsAt: at(addDays(c.today, 12), start), endsAt: at(addDays(c.today, 12), `${10 + Math.floor((i + 1) / 2)}:${(i + 1) % 2 ? '30' : '00'}`), studentId: booked ? st.id : null, bookedBy: booked ? c.guardianOf.get(st.id)![0] : null, bookedAt: booked ? at(addDays(c.today, -1)) : null });
    }
  });
  await k.ins('ptm_slots', slots, { returning: false });
}

export async function welfareAndDiscipline(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const counsellor = c.byEmail.counsellor.id;
  const go = c.byEmail.grievance.id;
  const low = c.students.filter((s) => s.presence < 0.74);
  await k.ins('counselling_sessions', c.students.filter((_, i) => i % 29 === 6).slice(0, 10).map((st, i) => ({ studentId: st.id, counsellorUserId: counsellor, requestedBy: i % 2 ? counsellor : (st.userId ?? counsellor), reason: ['Exam anxiety', 'Difficulty adjusting to hostel life', 'Career guidance', 'Family issues affecting studies', 'Low attendance follow-up', 'Time management'][i % 6], scheduledAt: at(addDays(c.today, i < 5 ? -(i + 1) * 3 : i - 3), '15:00'), status: i < 4 ? 'completed' : i < 6 ? 'scheduled' : i < 8 ? 'requested' : i === 8 ? 'no_show' : 'cancelled', confidentialNotes: i < 4 ? 'Agreed on a study routine. Review in two weeks. (Confidential.)' : '' })), { returning: false });

  const tickets = await k.ins<{ id: string }>('grievance_tickets', [
    ['GRV-2026-0001', 'hostel', 'medium', 'Hot water not available in Sharada Block', 'No hot water since last week in the mornings. Many girls are affected.', 'resolved'], ['GRV-2026-0002', 'exam', 'high', 'Marks card shows wrong subject name', 'My internal marks card lists Cost Accounting under Corporate Accounting.', 'in_progress'],
    ['GRV-2026-0003', 'transport', 'low', 'Bus 2 reaches late on Mondays', 'Route 2 is often 20 minutes late on Mondays.', 'assigned'], ['GRV-2026-0004', 'fees', 'medium', 'Fee receipt not received after bank transfer', 'I transferred the instalment on 12 August but my receipt is pending.', 'open'],
    ['GRV-2026-0005', 'infrastructure', 'low', 'Projector in Room 104 not working', 'Display flickers during class.', 'closed'], ['GRV-2026-0006', 'staff_conduct', 'high', 'Rude remarks by a part-time lecturer', 'Please look into this complaint; I prefer to remain anonymous.', 'escalated'],
    ['GRV-2026-0007', 'ragging', 'critical', 'Senior students demanding money in the hostel corridor', 'Reported to the anti-ragging committee.', 'assigned'],
  ].map(([ticketNo, category, severity, subject, description, status], i) => ({ ticketNo, category, severity, subject, description, anonymous: i === 5 || i === 6, committee: i === 6 ? 'anti_ragging' : null, committeeStage: i === 6 ? 'inquiry' : null, raisedBy: c.students[i * 13].userId ?? go, studentId: i === 5 || i === 6 ? null : c.students[i * 13].id, status, assigneeUserId: i === 3 ? null : go, slaDueAt: at(addDays(c.today, i < 3 ? -2 + i * 3 : 4 + i), '17:00'), escalationLevel: i === 5 ? 1 : 0, escalatedAt: i === 5 ? at(addDays(c.today, -1)) : null, resolution: status === 'resolved' || status === 'closed' ? 'Fixed and confirmed with the student.' : null, resolvedAt: status === 'resolved' || status === 'closed' ? at(addDays(c.today, -3)) : null, rating: status === 'closed' ? 4 : null, ratingComment: status === 'closed' ? 'Resolved quickly' : null, version: 1 })));
  await k.ins('grievance_events', tickets.flatMap((t, i) => [{ ticketId: t.id, actorUserId: go, actorRole: 'grievance_officer', kind: 'comment', visibility: 'public', body: 'We have received your grievance and assigned it.' }, ...(i % 2 === 0 ? [{ ticketId: t.id, actorUserId: go, actorRole: 'grievance_officer', kind: 'comment', visibility: 'internal', body: 'Checked with the department; fix scheduled.' }] : [])]), { returning: false });

  const rowdy = low.slice(0, 6);
  const incidents = await k.ins<{ id: string }>('discipline_incidents', rowdy.map((st, i) => ({ studentId: st.id, incidentOn: addDays(c.today, -(i + 3) * 4), kind: ['late_arrival', 'phone_use', 'misbehaviour', 'dress_code', 'property_damage', 'fighting'][i], severity: i === 5 ? 'major' : i === 4 ? 'major' : 'minor', description: ['Repeated late arrival to first period', 'Mobile phone used in class after warning', 'Disturbing the class and arguing with the lecturer', 'Not in uniform for a week', 'Damaged a desk in Room 103', 'Argument turned physical in the canteen'][i], reportedBy: c.teachers[i].id, status: ['closed', 'action_taken', 'under_review', 'closed', 'appealed', 'reported'][i], version: 1 })));
  const actions = await k.ins<{ id: string; incidentId: string }>('discipline_actions', incidents.slice(0, 5).map((inc, i) => ({ incidentId: inc.id, action: ['warning', 'warning', 'counselling_referral', 'fine', 'fine'][i], detail: ['Verbal warning recorded', 'Written warning to the guardian', 'Referred to the college counsellor', 'Dress code fine', 'Fine for damage to the desk'][i], finePaise: i >= 3 ? rupees(i === 3 ? 200 : 1500) : null, status: i === 4 ? 'reduced' : 'active', decidedBy: c.byEmail.principal.id })));
  await k.ins('discipline_appeals', { incidentId: incidents[4].id, actionId: actions[4].id, appellantUserId: c.guardianOf.get(rowdy[4].id)?.[0] ?? c.byEmail.principal.id, grounds: 'The desk was already damaged. We request a reduction of the fine.', status: 'reduced', decisionNote: 'Fine reduced from 2,500 to 1,500.', decidedBy: c.byEmail.principal.id, decidedAt: at(addDays(c.today, -2)) }, { returning: false });
  void r;
}

export async function governance(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principal = c.byEmail.principal.id;
  const comm = await k.ins<{ id: string; name: string }>('committees', [
    ['Internal Quality Assurance Cell (IQAC)', false], ['Internal Complaints Committee (POSH)', true], ['Anti-Ragging Committee', true], ['Grievance Redressal Committee', true], ['Admissions Committee', false], ['Examination Committee', false],
  ].map(([name, statutory]) => ({ name, statutory, description: 'Constituted as per the BCU / UGC guidelines.', active: true })));
  const members = c.teachers.slice(0, 9);
  await k.ins('committee_members', comm.flatMap((cm, i) => members.slice(i % 3, (i % 3) + 4).map((m, j) => ({ committeeId: cm.id, userId: m.id, role: j === 0 ? 'chair' : j === 1 ? 'secretary' : 'member', tenureStart: '2026-08-01', tenureEnd: '2027-07-31' }))), { returning: false });
  for (const [i, cm] of comm.slice(0, 4).entries()) {
    const meeting = await k.one<{ id: string }>('committee_meetings', { committeeId: cm.id, title: `${cm.name}: meeting ${i + 1}`, meetingOn: addDays(c.today, -20 + i * 6), agenda: 'Review of the semester, pending actions and compliance.', minutes: 'Discussed progress. Decisions recorded in the action items.', status: 'completed', createdBy: principal });
    await k.ins('committee_action_items', [0, 1].map((n) => ({ meetingId: meeting.id, committeeId: cm.id, title: ['Share the data with the IQAC', 'Update the awareness posters', 'Conduct a review next month'][n + (i % 2)], ownerUserId: members[(i + n) % members.length].id, dueOn: addDays(c.today, 10 + n * 10 - i * 5), status: n === 0 && i % 2 ? 'done' : 'open', completedAt: n === 0 && i % 2 ? at(addDays(c.today, -2)) : null })), { returning: false });
  }
  await k.ins('committee_meetings', { committeeId: comm[0].id, title: 'IQAC: AQAR preparation meeting', meetingOn: addDays(c.today, 8), agenda: 'AQAR data collection and SSR timelines.', status: 'scheduled', createdBy: principal }, { returning: false });
}

export async function research(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const coord = c.byEmail.research;
  const hodC = c.byEmail['hod.commerce'];
  const props = await k.ins<{ id: string }>('research_proposals', [
    { title: 'Impact of UPI on small retailers in North Bengaluru', abstract: 'A survey-based study of 300 shopkeepers.', kind: 'research', piUserId: hodC.id, departmentId: c.departments['Commerce'], sponsorOrg: 'ICSSR', fundingSoughtPaise: rupees(450000), ethicsRequired: true, ethicsStatus: 'cleared', ethicsRef: 'IEC/2026/04', status: 'approved', decidedBy: coord.id, decidedAt: at('2026-08-20') },
    { title: 'Low-code tools for MSME inventory management', abstract: 'Capstone with industry partners.', kind: 'industry', piUserId: c.byEmail['hod.computers'].id, departmentId: c.departments['Computer Applications'], sponsorOrg: 'Peenya Industries Association', fundingSoughtPaise: rupees(200000), ethicsRequired: false, ethicsStatus: 'not_required', status: 'approved', decidedBy: coord.id, decidedAt: at('2026-09-02') },
    { title: 'Women entrepreneurs and digital payments in Tumakuru district', abstract: 'Field study.', kind: 'research', piUserId: c.teachers[8].id, departmentId: c.departments['Management Studies'], fundingSoughtPaise: rupees(150000), ethicsRequired: true, ethicsStatus: 'pending', status: 'under_review' },
    { title: 'Student travel patterns and campus bus optimisation', abstract: 'Capstone project.', kind: 'capstone', piUserId: c.teachers[14].id, departmentId: c.departments['Computer Applications'], ethicsRequired: false, ethicsStatus: 'not_required', status: 'submitted' },
    { title: 'Draft: Sustainable packaging and brand loyalty', abstract: 'Draft proposal.', kind: 'research', piUserId: c.teachers[9].id, departmentId: c.departments['Management Studies'], ethicsRequired: false, ethicsStatus: 'not_required', status: 'draft' },
  ].map((p) => ({ ...p, version: 1 })));
  const projects = await k.ins<{ id: string }>('research_projects', [
    { proposalId: props[0].id, code: 'SIMS-RP-2026-01', title: props[0] && 'Impact of UPI on small retailers in North Bengaluru', kind: 'research', piUserId: hodC.id, departmentId: c.departments['Commerce'], sponsorOrg: 'ICSSR', startsOn: '2026-09-01', endsOn: '2027-08-31', status: 'active' },
    { proposalId: props[1].id, code: 'SIMS-RP-2026-02', title: 'Low-code tools for MSME inventory management', kind: 'industry', piUserId: c.byEmail['hod.computers'].id, departmentId: c.departments['Computer Applications'], sponsorOrg: 'Peenya Industries Association', startsOn: '2026-09-15', endsOn: '2027-03-31', status: 'active' },
    { code: 'SIMS-RP-2025-07', title: 'Financial literacy of first-generation college students', kind: 'research', piUserId: c.teachers[6].id, departmentId: c.departments['Commerce'], startsOn: '2025-08-01', endsOn: '2026-06-30', status: 'completed', outcomeSummary: 'Published in a UGC-CARE listed journal; used to design the literacy open elective.' },
  ].map((p) => ({ ...p, version: 1 })));
  await k.ins('project_members', [
    { projectId: projects[0].id, userId: c.teachers[6].id, role: 'co_supervisor' }, { projectId: projects[0].id, studentId: c.sections.find((s) => s.prog === 'MCM' && s.term === 3)!.students[0].id, role: 'student' }, { projectId: projects[0].id, studentId: c.sections.find((s) => s.prog === 'MCM' && s.term === 3)!.students[1].id, role: 'student' },
    { projectId: projects[1].id, userId: c.teachers[16].id, role: 'member' }, { projectId: projects[1].id, studentId: c.sections.find((s) => s.prog === 'BCA' && s.term === 5)!.students[0].id, role: 'student' },
  ], { returning: false });
  await k.ins('project_milestones', projects.slice(0, 2).flatMap((p, i) => [{ projectId: p.id, title: 'Literature review', dueOn: addDays(c.today, -20 + i * 5), completedOn: addDays(c.today, -22 + i * 5), evidenceRef: 'review.pdf' }, { projectId: p.id, title: 'Questionnaire and pilot', dueOn: addDays(c.today, 15), completedOn: null }, { projectId: p.id, title: 'Data collection', dueOn: addDays(c.today, 80), completedOn: null }]), { returning: false });
  const pubs = await k.ins<{ id: string }>('publications', [
    { projectId: projects[2].id, ownerUserId: c.teachers[6].id, title: 'Financial literacy among first-generation college students in Karnataka', kind: 'journal', venue: 'Journal of Commerce and Management Studies', year: 2026, doi: '10.0000/jcms.2026.0142', issn: '2456-0001', indexedIn: ['UGC-CARE'], authors: J(['Latha Gowda', 'Kavitha Murthy']) },
    { ownerUserId: hodC.id, title: 'GST compliance burden on micro enterprises', kind: 'conference', venue: 'National Conference on Taxation, Mysuru', year: 2025, authors: J(['Kavitha Murthy']) },
    { ownerUserId: c.byEmail['hod.computers'].id, title: 'A lightweight attendance system using face matching', kind: 'journal', venue: 'International Journal of Computer Applications', year: 2025, issn: '0975-8887', indexedIn: ['Scopus'], authors: J(['Srinivas Rao', 'Faisal Ahmed']) },
    { ownerUserId: c.teachers[11].id, title: 'Management Accounting for Small Business (chapter)', kind: 'book_chapter', venue: 'Edited volume, Sapna Book House', year: 2026, authors: J(['Sudhir Kamath']) },
  ]);
  void pubs;
  const grant = await k.one<{ id: string }>('research_grants', { projectId: projects[0].id, agency: 'ICSSR', scheme: 'Minor Research Project', sanctionRef: 'ICSSR/MRP/2026/118', sanctionedPaise: rupees(380000), startsOn: '2026-09-01', endsOn: '2027-08-31', status: 'active' });
  await k.ins('grant_expenses', [['Fieldwork travel', 18500, 'Travel to 12 markets'], ['Research assistant stipend', 24000, 'September and October'], ['Survey printing', 6200, 'Questionnaires']].map(([head, amt, desc], i) => ({ grantId: grant.id, head, amountPaise: rupees(amt as number), spentOn: addDays(c.today, -20 + i * 6), description: desc, voucherRef: `V-${2026}-${40 + i}`, createdBy: coord.id })), { returning: false });
  await k.ins('research_scholars', [{ fullName: 'Ananth Prabhu', programme: 'phd', supervisorUserId: hodC.id, projectId: projects[0].id, enrolledOn: '2025-01-10', thesisTitle: 'Digital payments and rural retail', status: 'enrolled' }, { fullName: 'Shreya Kamath', programme: 'phd', supervisorUserId: c.byEmail['hod.management'].id, enrolledOn: '2024-01-15', thesisTitle: 'Talent retention in Bengaluru start-ups', status: 'thesis_submitted' }, { fullName: 'Vinay Hegde', programme: 'mphil', supervisorUserId: c.byEmail['hod.computers'].id, enrolledOn: '2023-08-01', thesisTitle: 'Chatbots in student support', status: 'awarded', completedOn: '2025-07-15' }], { returning: false });
  await k.ins('conferences', [{ name: 'National Conference on Taxation', role: 'presented', level: 'national', heldOn: '2025-11-14', location: 'Mysuru', userId: hodC.id, paperTitle: 'GST compliance burden on micro enterprises' }, { name: 'ICCA 2026', role: 'attended', level: 'international', heldOn: '2026-03-06', location: 'Bengaluru', userId: c.byEmail['hod.computers'].id }, { name: 'Faculty development programme on NEP', role: 'attended', level: 'institutional', heldOn: '2026-07-22', location: 'Soundarya campus', userId: c.teachers[9].id }, { name: 'South India Management Meet', role: 'organised', level: 'national', heldOn: '2026-02-12', location: 'Soundarya campus', userId: c.byEmail['hod.management'].id }], { returning: false });
  await k.ins('patents', { projectId: projects[1].id, ownerUserId: c.byEmail['hod.computers'].id, title: 'Method for low-code stock reconciliation in small enterprises', kind: 'patent', inventors: J(['Srinivas Rao', 'Tarun Swamy']), applicationNo: '202641045678', filedOn: '2026-07-30', status: 'filed' }, { returning: false });
}

export async function documents(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;
  const storage = await service(ObjectStorage);
  const tpls = await k.ins<{ id: string; kind: string }>('certificate_templates', [
    { kind: 'bonafide', name: 'Bonafide certificate', subjectType: 'student', title: 'BONAFIDE CERTIFICATE', body: 'This is to certify that {{name}} (Roll No. {{rollNo}}) is a bonafide student of {{program}}, {{section}}, of Soundarya Institute of Management and Science, affiliated to Bengaluru City University, during the academic year 2026-27.', fields: J([{ key: 'purpose', label: 'Purpose', required: true }]), serialPrefix: 'BON', active: true, version: 1 },
    { kind: 'transfer_certificate', name: 'Transfer certificate', subjectType: 'student', title: 'TRANSFER CERTIFICATE', body: 'Certified that {{name}} (Roll No. {{rollNo}}) studied in this institution and is permitted to leave.', fields: J([{ key: 'reason', label: 'Reason for leaving', required: true }]), serialPrefix: 'TC', active: true, version: 1 },
    { kind: 'conduct', name: 'Conduct certificate', subjectType: 'student', title: 'CONDUCT CERTIFICATE', body: 'This is to certify that the conduct of {{name}} (Roll No. {{rollNo}}) has been good during the course.', fields: J([]), serialPrefix: 'CON', active: true, version: 1 },
    { kind: 'experience', name: 'Experience certificate', subjectType: 'staff', title: 'EXPERIENCE CERTIFICATE', body: 'This is to certify that {{name}} worked with Soundarya Institute of Management and Science.', fields: J([]), serialPrefix: 'EXP', active: true, version: 1 },
  ]);
  await k.ins('certificate_counters', [{ prefix: 'BON', financialYear: '2026-27', lastNo: 5 }, { prefix: 'CON', financialYear: '2026-27', lastNo: 1 }], { returning: false });
  const kids = c.students.filter((_, i) => i % 31 === 3).slice(0, 7);
  await k.ins('certificates', kids.map((st, i) => ({ templateId: tpls[i === 6 ? 2 : 0].id, subjectType: 'student', studentId: st.id, purpose: ['Bank account opening', 'Passport application', 'Scholarship application', 'Education loan', 'Visa application', 'Internship'][i % 6], fields: J({ purpose: 'Bank account opening' }), status: i < 4 ? 'issued' : i === 4 ? 'requested' : i === 5 ? 'approved' : 'rejected', requestedBy: st.userId ?? principal, decidedBy: i === 4 ? null : principal, decidedAt: i === 4 ? null : at(addDays(c.today, -i)), decisionNote: i === 6 ? 'Dues pending; apply after clearing the fee balance.' : null, serialNo: i < 4 ? `BON/2026-27/${String(i + 1).padStart(4, '0')}` : null, issuedBy: i < 4 ? principal : null, issuedAt: i < 4 ? at(addDays(c.today, -i), '12:00') : null, renderedTitle: i < 4 ? 'BONAFIDE CERTIFICATE' : null, renderedBody: i < 4 ? `This is to certify that ${st.name} (Roll No. ${st.rollNo}) is a bonafide student of the institution during 2026-27.` : null, verifyToken: i < 4 ? `SIMS-CERT-${2000 + i}-${r.int(100000, 999999)}` : null })), { returning: false });
  // Vault: student and staff documents with a small PDF each in storage.
  const docs: Record<string, unknown>[] = [];
  const vaultOwners = [...c.students.filter((_, i) => i % 40 === 9).slice(0, 8).map((s) => ({ type: 'student', id: s.id, label: s.name })), ...c.staff.slice(0, 5).map((s) => ({ type: 'staff', id: s.id, label: s.name }))];
  for (const [i, o] of vaultOwners.entries()) {
    const category = o.type === 'student' ? ['marks_card', 'aadhaar', 'caste_certificate', 'transfer_certificate'][i % 4] : ['appointment_letter', 'pan', 'qualification'][i % 3];
    const row = { ownerType: o.type, studentId: o.type === 'student' ? o.id : null, staffUserId: o.type === 'staff' ? o.id : null, title: `${o.label}: ${category.replace(/_/g, ' ')}`, category, contentType: 'application/pdf', sizeBytes: PDF.length, storageKey: `tenants/${c.tenantId}/vault/seed-${i}.pdf`, version: 1, visibility: i % 3 === 0 ? 'owner' : 'staff', expiresOn: category === 'qualification' ? null : addDays(c.today, i < 3 ? 18 + i * 4 : 300), uploadedBy: principal, scanStatus: 'clean' };
    await storage.put(row.storageKey, bufferStream(PDF), 1024 * 1024, 'application/pdf');
    docs.push(row);
  }
  await k.ins('vault_documents', docs, { returning: false });
  // Consents: every student (or guardian) has answered the data-processing notice; most allow AI features.
  await k.ins('consents', c.students.flatMap((st, i) => [{ studentId: st.id, purpose: 'data_processing', granted: true, noticeVersion: '2026-08', givenBy: st.userId ?? principal }, { studentId: st.id, purpose: 'ai_features', granted: i % 9 !== 0, noticeVersion: '2026-08', givenBy: st.userId ?? principal }, ...(i % 4 === 0 ? [{ studentId: st.id, purpose: 'photos', granted: i % 8 !== 0, noticeVersion: '2026-08', givenBy: st.userId ?? principal }] : [])]), { returning: false });
}

export async function lifecycle(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principal = c.byEmail.principal.id;
  const mba = c.sections.find((s) => s.prog === 'MBA' && s.term === 3)!;
  const mcm = c.sections.find((s) => s.prog === 'MCM' && s.term === 1)!;
  const bav = c.sections.find((s) => s.prog === 'BAV' && s.term === 3)!;
  await k.q("update students set status = 'on_leave', status_changed_at = $2 where id = $1", [mba.students[2].id, at('2026-09-10')]);
  await k.q("update students set status = 'detained', status_changed_at = $2 where id = $1", [bav.students[4].id, at('2026-08-05')]);
  const batch = await k.one<{ id: string }>('promotion_batches', { label: 'Even to odd semester promotion, August 2026', summary: J({ promoted: 168, detained: 3, graduated: 41, dropped: 2 }), runBy: principal });
  const history: Record<string, unknown>[] = [];
  for (const sec of c.sections.filter((s) => s.term >= 3).slice(0, 7)) {
    for (const st of sec.students.slice(0, 10)) history.push({ studentId: st.id, kind: 'promotion', fromStatus: 'active', toStatus: 'active', reason: `Promoted from semester ${sec.term - 1} to semester ${sec.term}`, effectiveOn: '2026-08-01', batchId: batch.id, actorId: principal });
  }
  history.push(
    { studentId: mba.students[2].id, kind: 'status', fromStatus: 'active', toStatus: 'on_leave', reason: 'Medical leave for surgery', effectiveOn: '2026-09-10', actorId: principal, approverId: c.byEmail['hod.management'].id, returnOn: '2026-11-15' },
    { studentId: bav.students[4].id, kind: 'status', fromStatus: 'active', toStatus: 'detained', reason: 'Attendance shortage in the previous semester', effectiveOn: '2026-08-05', actorId: principal },
    { studentId: mcm.students[0].id, kind: 'section', fromSectionId: mcm.id, toSectionId: mcm.id, reason: 'Roll number corrected', effectiveOn: '2026-08-12', actorId: principal },
    { studentId: c.students.find((s) => s.name === 'Vignesh Naik')!.id, kind: 'guardian', reason: 'Guardian phone number updated', effectiveOn: '2026-09-03', actorId: principal },
  );
  await k.ins('student_lifecycle_events', history, { returning: false });
}

export async function smartboards(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const roomsFor = ['Room 101', 'Room 102', 'Seminar Hall', 'Computer Lab 1'];
  const devices = await k.ins<{ id: string; roomId: string }>('devices', roomsFor.map((name, i) => ({ campusId: c.campusId, roomId: c.rooms.find((x) => x.name === name)!.id, name: `${name} Board`, platform: i === 3 ? 'windows' : 'android', appVersion: '1.8.2', enrolledAt: at('2026-08-02'), tokenVersion: 1, lastSeenAt: at(addDays(c.today, 0), '09:40'), health: J({ batteryPercent: null, storageFreeMb: 18200 - i * 1300, network: 'wifi', cpuTempC: 41 + i }), healthAt: at(addDays(c.today, 0), '09:40'), locked: false, kioskOverride: false })));
  const slots = await k.q<{ id: string; sectionId: string; subjectId: string; teacherId: string; roomId: string; dayOfWeek: number; startsAt: string }>("select id, section_id, subject_id, teacher_id, room_id, day_of_week, to_char(starts_at,'HH24:MI') as starts_at from timetable_slots where tenant_id = $1 and room_id = any($2::uuid[])", [c.tenantId, devices.map((d) => d.roomId)]);
  const sessions: { id: string; slot: (typeof slots)[number]; date: string }[] = [];
  for (let d = 1; d <= 6; d++) {
    const date = addDays(c.today, -d);
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    for (const sl of slots.filter((x) => x.dayOfWeek === wd && ['10:00', '11:15', '12:15'].includes(x.startsAt)).slice(0, 2)) {
      const dev = devices.find((x) => x.roomId === sl.roomId);
      if (!dev) continue;
      const row = await k.one<{ id: string }>('board_sessions', { deviceId: dev.id, teacherId: sl.teacherId, timetableSlotId: sl.id, sectionId: sl.sectionId, subjectId: sl.subjectId, startedAt: at(date, sl.startsAt), expiresAt: at(date, sl.startsAt.startsWith('10') ? '10:55' : '13:10'), endedAt: at(date, sl.startsAt.startsWith('10') ? '10:52' : '13:05'), endReason: d % 2 ? 'teacher_ended' : 'period_over', liveForClass: false });
      sessions.push({ id: row.id, slot: sl, date });
    }
  }
  for (const s of sessions) {
    const klass = c.sections.find((x) => x.id === s.slot.sectionId)!.students;
    const poll = await k.one<{ id: string }>('polls', { boardSessionId: s.id, sectionId: s.slot.sectionId, subjectId: s.slot.subjectId, teacherId: s.slot.teacherId, kind: 'mcq', question: 'Which of these is correct for today’s topic?', options: J(['A', 'B', 'C', 'D']), correct: 'B', openedAt: at(s.date, s.slot.startsAt), closedAt: at(s.date, s.slot.startsAt) });
    await k.ins('poll_responses', klass.slice(0, 18).map((st, i) => ({ pollId: poll.id, studentId: st.id, answer: r.chance(0.55 + st.ability * 0.3) ? 'B' : r.pick(['A', 'C', 'D']), source: i % 5 === 0 ? 'card' : 'app', answeredAt: at(s.date, s.slot.startsAt) })), { returning: false });
    await k.ins('participation_events', klass.slice(0, 5).map((st) => ({ studentId: st.id, boardSessionId: s.id, subjectId: s.slot.subjectId, outcome: r.pick(['correct', 'correct', 'partial', 'incorrect', 'answered']), recordedBy: s.slot.teacherId, occurredAt: at(s.date, s.slot.startsAt) })), { returning: false });
  }
  const blank = (n: number) => J({ v: 2, background: '#ffffff', canvas: { w: 1920, h: 1080 }, pages: Array.from({ length: n }, () => ({ strokes: [] })) });
  const wbs = await k.ins<{ id: string }>('whiteboards', sessions.slice(0, 6).map((s, i) => ({ id: crypto.randomUUID(), ownerId: s.slot.teacherId, boardSessionId: s.id, sectionId: s.slot.sectionId, subjectId: s.slot.subjectId, title: `Class notes: ${c.sections.find((x) => x.id === s.slot.sectionId)!.subjects.find((x) => x.id === s.slot.subjectId)?.name ?? 'lecture'}, ${s.date}`, pageCount: 2, content: blank(2), sizeBytes: 420, sharedAt: i % 2 ? at(s.date, '17:00') : null, version: 1 })));
  await k.ins('whiteboard_versions', wbs.map((w, i) => ({ whiteboardId: w.id, version: 1, title: `Version 1 (${i + 1})`, pageCount: 2, content: blank(2), sizeBytes: 420 })), { returning: false });
  await k.ins('recordings', sessions.slice(0, 5).map((s, i) => ({ id: crypto.randomUUID(), ownerId: s.slot.teacherId, deviceId: devices[0].id, boardSessionId: s.id, timetableSlotId: s.slot.id, sectionId: s.slot.sectionId, subjectId: s.slot.subjectId, title: `Lecture recording ${s.date}`, language: 'en', startedAt: at(s.date, s.slot.startsAt), durationMs: 2900000 + i * 40000, finishedAt: at(s.date, '10:50'), transcriptState: 'done', transcript: 'Today we looked at the main idea of the unit with two examples from the textbook and then solved a short problem together.', summaryState: 'done', summary: J({ summary: 'The class covered the core idea of the unit with examples and a worked problem.', keyPoints: ['Definition of the core term', 'Two worked examples', 'Exit question'] }), sharedAt: i % 2 ? at(s.date, '18:00') : null, keep: false })), { returning: false });
  await k.ins('badges', c.students.filter((_, i) => i % 15 === 1).slice(0, 16).map((st, i) => ({ studentId: st.id, sectionId: st.sectionId, badge: ['dazzling_performer', 'good_attempt', 'most_curious', 'outstanding_speaker', 'master_of_maths', 'best_leader'][i % 6], awardedBy: c.teachers[i % c.teachers.length].id, note: 'Awarded in class.' })), { returning: false });
  await k.ins('device_actions', [{ deviceId: devices[0].id, type: 'restart', params: J({}), status: 'done', requestedBy: c.byEmail.admin.id, sentAt: at(addDays(c.today, -3)), doneAt: at(addDays(c.today, -3)) }, { deviceId: devices[2].id, type: 'clear_cache', params: J({}), status: 'queued', requestedBy: c.byEmail.admin.id }], { returning: false });
}

export async function integrations(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const admin = c.byEmail.admin.id;
  const conn = await service(ConnectorsService);
  const view = await withTenant(c.tenantId, (tx) => conn.create(tx, { tenantId: c.tenantId, userId: admin }, { type: 'webhook_out', name: 'ERP sync to college data warehouse', config: { url: 'https://hooks.soundarya.demo.kinetix.in/kinetix/events', secret: 'demo-signing-secret-change-me-0001', events: ['fee.paid', 'results.published', 'student.enrolled'] }, enabled: false }));
  await k.ins('connector_deliveries', ['fee.paid', 'results.published', 'student.enrolled'].map((eventType, i) => ({ connectorId: view.id, eventId: crypto.randomUUID(), eventType, payload: J({ example: true }), status: ['delivered', 'dead', 'retrying'][i], attempts: [1, 5, 2][i], nextAttemptAt: i === 2 ? at(addDays(c.today, 0), '23:00') : null, responseStatus: [200, 503, 500][i], lastError: i ? 'Endpoint returned an error' : null, deliveredAt: i === 0 ? at(addDays(c.today, -4)) : null })), { returning: false });
  await k.q("update connectors set last_test_at = $2, last_test_status = 'ok', last_test_message = 'Endpoint accepted the test event' where id = $1", [view.id, at(addDays(c.today, -5))]);
}

export async function reportsAndSystem(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principal = c.byEmail.principal.id;
  await k.ins('custom_reports', [
    { name: 'Low attendance by class', description: 'Average attendance rate for each class.', dataset: 'attendance', definition: J({ columns: [], filters: [], groupBy: ['class'], aggregates: [{ fn: 'avg', field: 'present' }], sort: [{ field: 'class', dir: 'asc' }], limit: 500 }), createdBy: principal },
    { name: 'Fee balance by programme', description: 'Billed, paid and balance for each programme.', dataset: 'fees', definition: J({ columns: [], filters: [{ field: 'status', op: 'eq', value: 'due' }], groupBy: ['program'], aggregates: [{ fn: 'sum', field: 'amount' }, { fn: 'sum', field: 'paid' }, { fn: 'sum', field: 'balance' }], sort: [], limit: 100 }), createdBy: c.byEmail.accounts.id },
    { name: 'Students by programme and semester', description: 'Headcount.', dataset: 'students', definition: J({ columns: [], filters: [{ field: 'status', op: 'eq', value: 'active' }], groupBy: ['program', 'term'], aggregates: [{ fn: 'count' }], sort: [{ field: 'program', dir: 'asc' }], limit: 100 }), createdBy: principal },
  ], { returning: false });
  const sched = await k.ins<{ id: string }>('report_schedules', [{ reportKey: 'attendance.summary', params: J({}), frequency: 'weekly', format: 'csv', recipients: J(['principal@soundarya.demo.kinetix.in', 'hod.commerce@soundarya.demo.kinetix.in']), nextRunAt: at(addDays(c.today, 3), '07:00'), lastRunAt: at(addDays(c.today, -4), '07:00'), active: true, createdBy: principal }, { reportKey: 'fees.summary', params: J({}), frequency: 'monthly', format: 'pdf', recipients: J(['accounts@soundarya.demo.kinetix.in']), nextRunAt: at(addDays(c.today, 22), '07:00'), active: true, createdBy: principal }]);
  await k.ins('report_runs', [{ scheduleId: sched[0].id, reportKey: 'attendance.summary', params: J({}), format: 'csv', rowCount: 15, status: 'ok', deliveredTo: J(['principal@soundarya.demo.kinetix.in']), requestedBy: principal }, { reportKey: 'kpi.summary', params: J({}), format: 'csv', rowCount: 12, status: 'ok', deliveredTo: J([]), requestedBy: principal }], { returning: false });
  await k.ins('feature_flags', [{ key: 'analytics.accreditation', enabled: true, updatedBy: principal }, { key: 'documents.virus_scan', enabled: false, updatedBy: c.byEmail.admin.id }], { returning: false });
  await k.ins('tenant_security_policies', { mfaRequiredRoles: J([]), updatedBy: c.byEmail.admin.id }, { returning: false });
  const who = ['principal', 'accounts', 'admin', 'hr', 'library', 'admissions'];
  const acts: [string, string, string][] = [['auth.login', 'user', 'Signed in'], ['fees.payment_recorded', 'fee_payment', 'Cash receipt recorded'], ['marks.published', 'assessment', 'Internal marks published'], ['attendance.corrected', 'attendance', 'Attendance corrected by the HoD'], ['settings.changed', 'tenant', 'Academic calendar updated'], ['student.enrolled', 'student', 'Student enrolled'], ['library.fine_waived', 'library_loan', 'Fine waived by the librarian'], ['leave.approved', 'leave_request', 'Leave approved']];
  await k.ins('audit_log', Array.from({ length: 36 }, (_, i) => ({ actorType: 'user', actorId: c.byEmail[who[i % who.length]].id, action: acts[i % acts.length][0], subjectType: acts[i % acts.length][1], data: J({ note: acts[i % acts.length][2] }), at: at(addDays(c.today, -(i % 20)), `${String(9 + (i % 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`) })), { returning: false });
  void FEMALE;
  void SURNAMES;
}
