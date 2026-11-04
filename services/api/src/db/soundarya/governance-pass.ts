// Governance pass seed: the statutory committees with their kind, norms and properly (or not quite) constituted
// membership, outside members, this year's meetings with agenda, attendance, minutes approved and signed by the members,
// action-taken reports; policies with versions and acknowledgements; the RTI register; the compliance calendar; the
// published mandatory disclosure page; a grievance on UGC e-Samadhan; DPDP answer-by dates, a grievance and a nomination.
import { createHash } from 'node:crypto';
import { CommitteeGovService } from '../../governance/committee-gov.service.js';
import { minutesHash, nextOccurrence, rtiDueOn, ruleOf, standardDate, STANDARD_DEADLINES, type CommitteeKind } from '../../governance/statutory.js';
import type { Ctx } from './ctx.js';
import { DOMAIN, INST } from './data.js';
import { addDays, at, J } from './kit.js';
import { service } from './nest.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function governancePass(c: Ctx): Promise<void> {
  // The statutory bodies and texts here are a college's (UGC, the affiliating university); the school demo keeps its own.
  if (INST.kind !== 'college') return;
  const k = c.kit;
  const t = c.tenantId;
  const d = (n: number) => addDays(c.today, n);
  const principal = c.byEmail.principal.id;
  const iqac = c.byEmail.iqac?.id ?? principal;
  const admin = c.byEmail.admin?.id ?? principal;
  const signer = await service(CommitteeGovService);
  const year = (await k.q<{ startsOn: string; endsOn: string }>(`select starts_on::text, ends_on::text from academic_years where tenant_id = $1 and is_current`, [t]))[0];
  const yFrom = year?.startsOn ?? d(-150);

  // The earlier stage wrote 'completed' for meetings that took place; the committee pages count 'held'.
  await k.q(`update committee_meetings set status = 'held' where tenant_id = $1 and status = 'completed'`, [t]);

  // ---- committees: kind, norms, public contact -----------------------------------------------------------------
  const existing = await k.q<{ id: string; name: string }>(`select id, name from committees where tenant_id = $1`, [t]);
  const kindOf = (name: string): CommitteeKind | null =>
    /IQAC/i.test(name) ? 'iqac' : /POSH|Complaints/i.test(name) ? 'icc' : /Squad/i.test(name) ? 'anti_ragging_squad' : /Anti-Ragging/i.test(name) ? 'anti_ragging' : /Grievance/i.test(name) ? 'grievance_redressal' : /SC\/ST/i.test(name) ? 'sc_st_cell' : /Minority/i.test(name) ? 'minority_cell' : /Governing|Development Council/i.test(name) ? 'governing_body' : null;
  const contact: Partial<Record<CommitteeKind, { helpline: string; email: string }>> = {
    anti_ragging: { helpline: '+91 80 2345 6701', email: 'antiragging@soundarya.edu.in' },
    anti_ragging_squad: { helpline: '+91 80 2345 6702', email: 'squad@soundarya.edu.in' },
    icc: { helpline: '+91 80 2345 6703', email: 'icc@soundarya.edu.in' },
    grievance_redressal: { helpline: '+91 80 2345 6704', email: 'sgrc@soundarya.edu.in' },
    sc_st_cell: { helpline: '', email: 'scst.cell@soundarya.edu.in' },
  };
  const byKind = new Map<string, string>();
  for (const cm of existing) {
    const kind = kindOf(cm.name);
    // One committee of each kind (the hostel stage may have made a second anti-ragging committee for its hostels).
    if (!kind || byKind.has(kind)) continue;
    const r = ruleOf(kind)!;
    await k.q(
      `update committees set kind = $2, statutory = true, mandate = $3, meetings_per_year = $4, quorum_pct = $5, constituted_on = $6, order_ref = $7, public = $8, helpline = $9, email = $10, description = $11 where id = $1`,
      [cm.id, kind, r.mandate, r.meetingsPerYear, r.quorumPct, yFrom, `SIMS/PRL/${kind.toUpperCase()}/2026-27`, r.public, contact[kind]?.helpline ?? '', contact[kind]?.email ?? '', r.basis],
    );
    byKind.set(kind, cm.id);
  }
  for (const kind of ['anti_ragging_squad', 'sc_st_cell', 'governing_body', 'minority_cell'] as const) {
    if (byKind.has(kind)) continue;
    const r = ruleOf(kind)!;
    const row = await k.one<{ id: string }>('committees', { name: r.name, statutory: true, kind, mandate: r.mandate, description: r.basis, meetingsPerYear: r.meetingsPerYear, quorumPct: r.quorumPct, public: r.public, constitutedOn: yFrom, orderRef: `SIMS/PRL/${kind.toUpperCase()}/2026-27`, helpline: contact[kind]?.helpline ?? '', email: contact[kind]?.email ?? '', active: true });
    byKind.set(kind, row.id);
  }

  // ---- members: genders from the staff profiles, outside members, a woman presiding over the ICC ------------------
  await k.q(
    `update committee_members m set gender = case when lower(sp.gender) like 'f%' then 'female' when lower(sp.gender) like 'm%' then 'male' else '' end, designation = coalesce((select d.name from designations d where d.id = sp.designation_id), '')
     from staff_profiles sp where sp.user_id = m.user_id and m.tenant_id = $1`,
    [t],
  );
  const staffG = await k.q<{ id: string; gender: string }>(`select u.id, lower(coalesce(sp.gender, '')) as gender from users u join staff_profiles sp on sp.user_id = u.id join user_roles ur on ur.user_id = u.id and ur.role = 'teacher' where u.tenant_id = $1 order by u.full_name`, [t]);
  const women = staffG.filter((s) => s.gender.startsWith('f')).map((s) => s.id);
  const men = staffG.filter((s) => s.gender.startsWith('m')).map((s) => s.id);
  const studentUsers = (await k.q<{ userId: string }>(`select user_id from students where tenant_id = $1 and user_id is not null order by roll_no limit 4`, [t])).map((r) => r.userId);
  const add = async (kind: string, rows: Record<string, unknown>[]) => {
    const id = byKind.get(kind);
    if (id) await k.ins('committee_members', rows.filter((r) => r.userId || r.name).map((r) => ({ committeeId: id, tenureStart: yFrom, tenureEnd: addDays(yFrom, 3 * 365 - 1), role: 'member', category: 'internal', ...r })), { returning: false });
  };
  // ICC: replace the seeded membership with one the Act accepts (a woman presides, half are women, an NGO member).
  if (byKind.has('icc')) {
    await k.q(`delete from committee_members where committee_id = $1`, [byKind.get('icc')]);
    await add('icc', [
      { userId: women[0], role: 'chair', gender: 'female', designation: 'Associate Professor' },
      { userId: women[1], gender: 'female' },
      { userId: men[0], gender: 'male' },
      { userId: men[1], gender: 'male' },
      { name: 'Adv. Shobha Rani (Vanitha Sahaya Vani)', category: 'ngo', role: 'external', gender: 'female', designation: 'Counsel', contactPublic: true, phone: '+91 98450 11223' },
      ...(studentUsers[0] ? [{ userId: studentUsers[0], category: 'student', gender: 'female', tenureEnd: addDays(yFrom, 364) }] : []),
    ]);
  }
  await add('anti_ragging', [
    { name: 'Sri K. Ramesh, Police Inspector, Yeshwanthpur', category: 'government', role: 'external', gender: 'male', contactPublic: true, phone: '+91 80 2294 2532' },
    { name: 'Smt. Lalitha Prakash (parent)', category: 'parent', role: 'external', gender: 'female' },
    { name: 'Sri Mohan Kumar, Prajavani', category: 'media', role: 'external', gender: 'male' },
    ...(studentUsers[1] ? [{ userId: studentUsers[1], category: 'student', gender: 'male', tenureEnd: addDays(yFrom, 364) }] : []),
  ]);
  await add('anti_ragging_squad', [{ userId: men[2], role: 'chair', gender: 'male', contactPublic: true, phone: '+91 98860 44551' }, { userId: women[2], gender: 'female' }, { userId: men[3], gender: 'male' }]);
  await add('grievance_redressal', [...(studentUsers[2] ? [{ userId: studentUsers[2], category: 'student', gender: 'female', tenureEnd: addDays(yFrom, 364) }] : []), { userId: women[3], gender: 'female' }]);
  await add('iqac', [
    { name: 'Dr. Arvind Shenoy (Bosch Ltd.)', category: 'industry', role: 'external', gender: 'male' },
    { name: 'Ms. Nandini Rao (alumna, 2014)', category: 'alumni', role: 'external', gender: 'female' },
    ...(studentUsers[3] ? [{ userId: studentUsers[3], category: 'student', gender: 'male', tenureEnd: addDays(yFrom, 364) }] : []),
    { userId: iqac, role: 'secretary', gender: 'female', designation: 'IQAC Coordinator' },
    { name: 'Sri B. Prakash (local society)', category: 'external', role: 'external', gender: 'male' },
  ]);
  // The SC/ST cell has a liaison officer but no chair yet: the page shows it needs attention.
  await add('sc_st_cell', [{ userId: men[4], role: 'secretary', gender: 'male', designation: 'Liaison officer' }, { userId: women[4], gender: 'female' }, { userId: men[5], gender: 'male' }]);
  await add('governing_body', [
    { userId: principal, role: 'secretary', gender: 'female', designation: 'Principal, member secretary' },
    { name: 'Sri R. Venkatesh, Chairman, Soundarya Educational Trust', category: 'external', role: 'chair', gender: 'male' },
    { name: 'Prof. M. S. Shivaprasad, university nominee', category: 'government', role: 'external', gender: 'male' },
    { name: 'Sri Ajay Gupta (industry)', category: 'industry', role: 'external', gender: 'male' },
    { userId: women[5], gender: 'female' },
  ]);
  await add('minority_cell', [{ userId: men[6], role: 'chair', gender: 'male' }, { userId: women[6], gender: 'female' }, { userId: women[7], gender: 'female' }]);

  // ---- meetings this year: agenda, attendance, minutes approved and signed --------------------------------------
  const plan: [string, number, string[]][] = [
    ['iqac', -95, ['Action taken on the last meeting', 'AQAR 2025-26 data collection', 'Feedback analysis from students and employers']],
    ['iqac', -12, ['Review of the AQAR draft', 'Academic audit schedule', 'Best practice write-ups']],
    ['icc', -60, ['Awareness programme for new students', 'Status of complaint ICC/2026/02']],
    ['anti_ragging', -110, ['Undertakings from new students', 'Squad duty roster for the first month']],
    ['anti_ragging_squad', -100, ['Surprise checks of hostels and buses: report']],
    ['grievance_redressal', -45, ['Grievances of the quarter', 'Appeal of G-2026-014 to the ombudsperson']],
    ['governing_body', -70, ['Budget 2026-27', 'New posts in Computer Applications', 'Fee structure for 2027-28']],
    ['sc_st_cell', -30, ['Post-matric scholarship applications', 'Remedial classes']],
  ];
  const MINUTES = 'The meeting began at 3:30 pm. The minutes of the last meeting were read and confirmed.';
  type Item = { seq: number; title: string; presenter: string; discussion: string; resolution: string; outcome: string };
  /** Attendance (everyone but one on leave), the minutes' fingerprint, and the signatures of the chair and most of those present. */
  const record = async (meetingId: string, committeeId: string, title: string, on: string, minutesText: string, agenda: Item[], pending: boolean) => {
    const ms = await k.q<{ id: string; userId: string | null; role: string }>(`select id, user_id, role from committee_members where committee_id = $1 and tenure_start <= $2 and (tenure_end is null or tenure_end >= $2)`, [committeeId, on]);
    const att = ms.map((x, n) => ({ memberId: x.id, status: n === ms.length - 1 && ms.length > 3 ? 'leave' : 'present' }));
    if (att.length) await k.ins('committee_meeting_attendance', att.map((a) => ({ meetingId, ...a })), { returning: false });
    const hash = minutesHash({ title, meetingOn: on, minutes: minutesText, agenda, attendance: att });
    const present = ms.filter((x, n) => att[n].status === 'present' && x.userId);
    const signers = pending ? present.filter((x) => x.role !== 'chair').slice(0, 1) : present.slice(0, Math.max(1, Math.ceil(present.length / 2) + 1));
    const lead = present.find((x) => x.role === 'chair') ?? present.find((x) => x.role === 'secretary');
    if (!pending && lead && !signers.includes(lead)) signers.push(lead);
    const rows = signers.map((x, n) => {
      const signedAt = at(addDays(on, 2 + n), '10:15');
      return { meetingId, memberId: x.id, userId: x.userId, decision: 'approve', comment: '', minutesHash: hash, signature: signer.sign(hash, x.id, 'approve', signedAt), signedAt };
    });
    if (rows.length) await k.ins('committee_minute_signoffs', rows, { returning: false });
    const approved = !pending && !!lead;
    await k.q(`update committee_meetings set minutes_status = $2, minutes_hash = $3, minutes_circulated_at = $4, minutes_approved_at = $5 where id = $1`, [meetingId, approved ? 'approved' : 'circulated', hash, at(addDays(on, 1)), approved ? at(addDays(on, 2 + rows.length - 1), '10:15') : null]);
    return present;
  };
  // Meetings an earlier stage recorded: one agenda item from their agenda text, attendance and signatures as above.
  const legacy = await k.q<{ id: string; committeeId: string; title: string; meetingOn: string; minutes: string; agenda: string }>(`select id, committee_id, title, meeting_on::text, minutes, agenda from committee_meetings where tenant_id = $1 and status = 'held' and minutes_hash is null`, [t]);
  for (const m of legacy) {
    const item = { seq: 1, title: m.agenda.split(/\r?\n/)[0].replace(/^\d+\.\s*/, '') || 'Review', presenter: '', discussion: '', resolution: 'Recorded in the action items.', outcome: 'resolved' };
    await k.ins('committee_agenda_items', { meetingId: m.id, ...item }, { returning: false });
    await record(m.id, m.committeeId, m.title, m.meetingOn, m.minutes, [item], false);
  }
  await k.q(`update committee_action_items set action_taken = 'Completed as the committee resolved.', reported_on = (completed_at at time zone 'Asia/Kolkata')::date where tenant_id = $1 and status = 'done' and action_taken = ''`, [t]);
  const meetings: { id: string; kind: string; on: string }[] = [];
  for (const [i, [kind, off, items]] of plan.entries()) {
    const committeeId = byKind.get(kind);
    if (!committeeId) continue;
    const on = d(off);
    const title = `${ruleOf(kind)?.name.split(' (')[0] ?? kind}: meeting ${i + 1} of 2026-27`;
    const m = await k.one<{ id: string }>('committee_meetings', { committeeId, title, meetingOn: on, startsAt: '15:30', venue: 'Board room, Block A', agenda: items.map((x, n) => `${n + 1}. ${x}`).join('\n'), minutes: 'The meeting began at 3:30 pm. The minutes of the last meeting were read and confirmed.', status: 'held', noticeSentAt: at(addDays(on, -7), '11:00'), createdBy: principal });
    meetings.push({ id: m.id, kind, on });
    const agenda = items.map((title2, n) => ({ seq: n + 1, title: title2, presenter: '', discussion: n === 0 ? 'Members reviewed the report placed before them.' : '', resolution: ['Approved as placed.', 'Resolved to complete by the end of the month.', 'Noted; the coordinator to report at the next meeting.'][n % 3], outcome: n === 2 ? 'noted' : 'resolved' }));
    await k.ins('committee_agenda_items', agenda.map((a) => ({ meetingId: m.id, ...a })), { returning: false });
    // The latest IQAC meeting's minutes are still with the members; the others are approved by the chair and most present.
    const present = await record(m.id, committeeId, title, on, MINUTES, agenda, kind === 'iqac' && off === -12);
    // Action items with the action taken (older ones done, one overdue).
    const owners = present.filter((x) => x.userId).map((x) => x.userId!);
    if (owners.length) {
      const acts = [
        { title: `Circulate the decisions on "${items[0]}" to the departments`, ownerUserId: owners[0], dueOn: addDays(on, 14), status: 'done', actionTaken: 'Circular issued to all heads of department; acknowledged by email.', reportedOn: addDays(on, 9), completedAt: at(addDays(on, 9)) },
        { title: `Report on "${items[items.length - 1]}"`, ownerUserId: owners[1 % owners.length], dueOn: kind === 'governing_body' ? d(-5) : addDays(on, 60), status: off < -50 ? 'done' : 'open', actionTaken: off < -50 ? 'Report placed before the committee and accepted.' : '', reportedOn: off < -50 ? addDays(on, 40) : null, completedAt: off < -50 ? at(addDays(on, 40)) : null },
      ];
      await k.ins('committee_action_items', acts.map((a) => ({ meetingId: m.id, committeeId, ...a })), { returning: false });
    }
  }
  // Upcoming meetings with the notice not yet sent.
  for (const [kind, off, title] of [['icc', 9, 'ICC meeting: annual report to the District Officer'], ['governing_body', 21, 'Governing body: mid-year review']] as const) {
    const committeeId = byKind.get(kind);
    if (!committeeId) continue;
    const m = await k.one<{ id: string }>('committee_meetings', { committeeId, title, meetingOn: d(off), startsAt: '15:00', venue: 'Board room, Block A', agenda: '1. Annual report\n2. Any other matter', status: 'scheduled', createdBy: principal });
    await k.ins('committee_agenda_items', [{ meetingId: m.id, seq: 1, title: 'Annual report', presenter: '' }, { meetingId: m.id, seq: 2, title: 'Any other matter', presenter: '' }], { returning: false });
  }

  // ---- policies with versions and acknowledgements --------------------------------------------------------------
  const teachers = c.teachers.map((x) => x.id);
  const studentIds = (await k.q<{ userId: string }>(`select user_id from students where tenant_id = $1 and user_id is not null order by roll_no`, [t])).map((r) => r.userId);
  const policies: [string, string, string, string[], boolean, number, string][] = [
    ['POL/GEN/01', 'Code of conduct for staff', 'code_of_conduct', ['teacher', 'hod'], true, 24, 'Every member of staff shall treat students and colleagues with dignity, keep student information confidential, and declare any conflict of interest to the principal.'],
    ['POL/STU/01', 'Code of conduct for students', 'code_of_conduct', ['student'], true, 24, 'Students shall attend classes regularly, respect staff and fellow students, keep the campus clean and follow the rules of the library, laboratories and hostels.'],
    ['POL/AR/01', 'Anti-ragging policy', 'anti_ragging', ['student', 'teacher'], true, 12, 'Ragging in any form is prohibited on and off the campus. Every student and parent gives an undertaking at admission. Complaints reach the anti-ragging committee and squad, whose numbers are on the notice boards and the website.'],
    ['POL/POSH/01', 'Prevention of sexual harassment', 'posh', ['teacher', 'hod', 'student'], true, 36, 'The institution has zero tolerance for sexual harassment. The Internal Complaints Committee hears complaints in confidence and completes its inquiry within ninety days.'],
    ['POL/DP/01', 'Data protection and privacy', 'data_protection', ['teacher', 'hod', 'accountant'], true, 24, 'Personal data of students, parents and staff is collected for stated purposes only, kept no longer than needed, and shared only as the law allows. Data principals may ask for a copy, correction or erasure.'],
    ['POL/EX/01', 'Examination and evaluation policy', 'examination', ['teacher'], false, 36, 'Internal assessment carries 40 per cent; answer scripts are shown to students; revaluation is available within ten days of the results.'],
    ['POL/IT/01', 'Acceptable use of IT resources', 'it', ['teacher', 'student'], false, 24, 'Campus devices and networks are for academic use. Sharing passwords, installing unlicensed software or accessing others’ accounts is not allowed.'],
    ['POL/ENV/01', 'Green campus and waste management', 'environment', [], true, 36, 'The campus segregates waste at source, harvests rainwater, and audits energy and water use every year.'],
  ];
  for (const [i, [code, title, category, audience, pub, review, body]] of policies.entries()) {
    const effective = d(-200 + i * 15);
    const pol = await k.one<{ id: string }>('governance_policies', { code, title, category, audience, public: pub, reviewMonths: review, ownerUserId: i % 2 ? iqac : principal, nextReviewOn: i === 5 ? d(-10) : addDays(effective, review * 30), createdBy: iqac });
    const v1 = await k.one<{ id: string }>('governance_policy_versions', { policyId: pol.id, version: 1, body, changeNote: 'First version', status: i === 0 || i === 2 ? 'superseded' : 'published', effectiveFrom: effective, authoredBy: iqac, approvedBy: principal, approvedAt: at(addDays(effective, -3)), publishedAt: at(effective), contentHash: sha(body) });
    let current = v1.id;
    if (i === 0 || i === 2) {
      const body2 = `${body} ${i === 0 ? 'Staff shall not use social media to comment on students or share their photographs without consent.' : 'The squad makes surprise checks of hostels, buses and canteens in the first three months.'}`;
      const v2 = await k.one<{ id: string }>('governance_policy_versions', { policyId: pol.id, version: 2, body: body2, changeNote: i === 0 ? 'Social media clause' : 'Squad checks', status: 'published', effectiveFrom: d(-40 + i), authoredBy: iqac, approvedBy: admin, approvedAt: at(d(-42 + i)), publishedAt: at(d(-40 + i)), contentHash: sha(body2) });
      current = v2.id;
      // Most acknowledged the first version; fewer have the second.
      await k.ins('governance_policy_acks', (i === 0 ? teachers : [...teachers, ...studentIds]).slice(0, 30).map((u, n) => ({ versionId: v1.id, userId: u, acknowledgedAt: at(addDays(effective, 1 + (n % 9))) })), { returning: false });
    }
    if (i === 6) await k.ins('governance_policy_versions', { policyId: pol.id, version: 2, body: `${body} Personal devices on the campus network must be registered.`, changeNote: 'Device registration', status: 'in_review', authoredBy: iqac }, { returning: false });
    const who = [...(audience.includes('teacher') ? teachers : []), ...(audience.includes('student') ? studentIds : [])];
    const share = [0.6, 0.45, 0.7, 0.8, 0.9, 0.55, 0.5, 0][i];
    await k.ins('governance_policy_acks', who.slice(0, Math.floor(who.length * share)).map((u, n) => ({ versionId: current, userId: u, acknowledgedAt: at(d(-35 + (n % 30))) })), { returning: false });
  }

  // ---- the RTI register -------------------------------------------------------------------------------------------
  const rti = [
    { applicantName: 'R. Mehta', address: '14, 3rd Cross, Malleswaram, Bengaluru', receivedOn: d(-50), mode: 'post', subject: 'Merit list of BCom admissions 2026', information: 'Certified copies of the merit list and the cut-off for each category.', feePaise: 1000, feeRef: 'IPO 41F 223344', status: 'replied', reply: 'Copies of the merit list (6 pages) enclosed.', repliedOn: d(-28), additionalFeePaise: 1200 },
    { applicantName: 'S. Nagaraj', address: 'Rajajinagar, Bengaluru', receivedOn: d(-40), mode: 'online', subject: 'Staff appointed in 2025-26', information: 'Names, posts and dates of appointment of teaching staff appointed in 2025-26.', feePaise: 1000, feeRef: 'Online 88231', status: 'replied', reply: 'List of 7 appointments enclosed.', repliedOn: d(-12), additionalFeePaise: 400, appealFiledOn: d(-6), appealGrounds: 'Qualifications not given.', appealDueOn: d(24) },
    { applicantName: 'Anonymous student group', address: 'Care of the students union', receivedOn: d(-35), mode: 'in_person', subject: 'Answer scripts of another student', information: 'Copies of the answer scripts of a named student.', feePaise: 1000, feeRef: 'Receipt 1182', status: 'rejected', rejectionSection: '8(1)(j)', reply: 'Personal information of a third party with no larger public interest.', repliedOn: d(-20) },
    { applicantName: 'K. Iyer', address: 'Yelahanka, Bengaluru', receivedOn: d(-33), mode: 'post', subject: 'Utilisation of the NSS grant', information: 'Statement of NSS grant received and spent in 2025-26.', feePaise: 1000, feeRef: 'DD 551234', status: 'received' },
    { applicantName: 'M. Fathima', address: 'Hebbal, Bengaluru', receivedOn: d(-4), mode: 'email', subject: 'Hostel fee for 2026-27', information: 'Approved hostel fee and the order approving it.', feePaise: 0, bpl: true, status: 'received' },
    { applicantName: 'P. Rao', address: 'Vijayanagar, Bengaluru', receivedOn: d(-6), mode: 'post', subject: 'Land records of the university', information: 'Land records of the affiliating university.', feePaise: 1000, feeRef: 'IPO 41F 778899', status: 'transferred', transferredTo: 'Public Information Officer, Bengaluru City University', transferredOn: d(-3) },
  ];
  for (const [n, r] of rti.entries()) {
    await k.ins('rti_requests', { requestNo: `RTI/2026-27/${String(n + 1).padStart(4, '0')}`, ...r, dueOn: rtiDueOn(r.receivedOn, { lifeLiberty: false, viaApio: false }), pioUserId: admin, createdBy: admin }, { returning: false });
  }

  // ---- the compliance calendar ----------------------------------------------------------------------------------
  // Each standard deadline of the year: the ones already past are done on time (with the portal's acknowledgement)
  // except the trust's income-tax return, which is still pending; a recurring one also has its next occurrence.
  const start = Number((year?.startsOn ?? c.today).slice(0, 4));
  const owner = (a: string) => (['naac', 'aishe', 'nirf', 'ugc'].includes(a) ? iqac : ['income_tax', 'epfo'].includes(a) ? c.byEmail.accounts?.id ?? admin : admin);
  for (const s of STANDARD_DEADLINES) {
    let due = standardDate(s, start);
    const row = { title: s.title, authority: s.authority, frameworkKey: s.frameworkKey ?? null, recurrence: s.recurrence, note: s.note, ownerUserId: owner(s.authority), createdBy: iqac };
    // Past occurrences, oldest first, done three days early; the last ITR is left open (overdue).
    while (due < c.today) {
      const late = s.title.startsWith('Income-tax return');
      if (late) break;
      const next = nextOccurrence(due, s.recurrence);
      await k.ins('compliance_deadlines', { ...row, dueOn: due, status: 'done', completedOn: addDays(due, -3), reference: `ACK-${due.replace(/-/g, '')}`, remindersSent: 2, lastRemindedOn: addDays(due, -7) }, { returning: false });
      if (!next) {
        due = '';
        break;
      }
      due = next;
    }
    if (due) await k.ins('compliance_deadlines', { ...row, dueOn: due, status: 'pending' }, { returning: false });
  }
  // The ITR went in late (shows as overdue on the calendar if the date has passed), and one deadline of the institution's own.
  await k.ins('compliance_deadlines', { title: 'Fire safety certificate renewed', authority: 'state', dueOn: d(12), recurrence: 'annual', ownerUserId: admin, note: 'Karnataka Fire and Emergency Services', createdBy: iqac }, { returning: false });

  // ---- the disclosure page -------------------------------------------------------------------------------------------
  const lines: [string, string, string][] = [
    ['approvals', 'Affiliation', `Permanently affiliated to Bengaluru City University; recognised under sections 2(f) and 12(B) of the UGC Act`],
    ['approvals', 'NAAC accreditation', 'Accredited with grade A (CGPA 3.12), second cycle, valid until 2029'],
    ['governance', 'Ombudsperson (UGC Regulations, 2023)', 'Prof. H. N. Ramesh (retired), ombudsperson@bcu.ac.in'],
    ['governance', 'Public Information Officer', `Mahesh Gowda, Administrative Officer, admin@${DOMAIN}`],
    ['fees', 'Fee approval', 'Fees as approved by the Fee Regulation Committee, order dated 12 June 2026'],
    ['fees', 'Refund policy', 'As per the UGC notification on refund of fees (full refund less Rs 1,000 till the last date of admission)'],
    ['infrastructure', 'Campus', '6.2 acres; built-up area 18,400 sq m; 42 classrooms, 9 laboratories, library of 32,000 volumes'],
  ];
  await k.ins('disclosure_items', lines.map(([section, label, value], n) => ({ section, label, value, sortOrder: n, public: true, updatedBy: iqac })), { returning: false });
  await k.ins('disclosure_items', { section: 'fees', label: 'Draft fee proposal 2027-28', value: 'Under discussion with the governing body', public: false, sortOrder: 99, updatedBy: iqac }, { returning: false });
  await k.ins('disclosure_settings', { published: true, publishedAt: at(d(-20)), intro: `Information disclosed by ${INST.name} as required by the UGC and the affiliating university.`, updatedBy: iqac }, { returning: false });

  // ---- a grievance on UGC e-Samadhan, DPDP answer-by dates ----------------------------------------------------------
  await k.q(`update grievance_tickets set external_portal = 'e_samadhan', external_ref = 'UGC/ES/2026/00' || substr(md5(id::text), 1, 5), external_ref_on = (created_at at time zone 'Asia/Kolkata')::date + 2 where id in (select id from grievance_tickets where tenant_id = $1 and committee is null and category in ('exam', 'fees', 'academic') order by created_at limit 1)`, [t]);
  await k.q(`update dpdp_requests set due_at = created_at + case when kind = 'grievance' then interval '90 days' else interval '30 days' end where tenant_id = $1 and due_at is null`, [t]);
  const parent = (await k.q<{ id: string }>(`select id from users where tenant_id = $1 and email = $2`, [t, `parent.bca@${DOMAIN}`]))[0]?.id;
  if (parent)
    await k.ins('dpdp_requests', [
      { userId: parent, kind: 'grievance', status: 'pending', details: 'My phone number was given to a coaching centre without my consent.', createdAt: at(d(-12), '18:20'), dueAt: at(d(78), '18:20') },
      { userId: parent, kind: 'nomination', status: 'completed', details: 'Nominee for my and my ward’s data.', nominee: J({ name: 'Suresh Naik', relation: 'spouse', phone: '+91 98450 22113' }), processedBy: principal, processedAt: at(d(-20)), createdAt: at(d(-22)), dueAt: at(d(8)) },
    ], { returning: false });
}
