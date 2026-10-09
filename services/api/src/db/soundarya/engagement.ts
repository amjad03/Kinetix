/** Placements and internships, alumni and giving, campus life, mentoring, skills passport and SDGs. */
import { FEMALE, MALE, SURNAMES } from './data.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';

export async function placements(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const po = c.byEmail.placements.id;
  const companies = await k.ins<{ id: string; name: string }>('placement_companies', [
    ['Brightwave Technologies', 'IT services', 'Ms. Pooja Kamath'], ['Kaveri Financial Services', 'Banking and finance', 'Mr. Anil Setty'], ['Namma Retail Pvt Ltd', 'Retail', 'Ms. Divya Rao'], ['SkyBridge Aviation Services', 'Aviation ground handling', 'Capt. Rohan Menon'],
    ['Lalbagh Analytics', 'Analytics', 'Mr. Shashank Hegde'], ['Hoysala Logistics', 'Logistics', 'Ms. Fathima Khan'], ['Cauvery Insurance Brokers', 'Insurance', 'Mr. Vivek Nayak'], ['Vidhana Consulting LLP', 'Consulting', 'Ms. Radhika Iyer'],
  ].map(([name, sector, contactName], i) => ({ name, sector, website: `https://www.${name.toLowerCase().replace(/[^a-z]+/g, '')}.demo.kinetix.in`, contactName, contactEmail: `hr@${name.toLowerCase().replace(/[^a-z]+/g, '')}.demo.kinetix.in`, contactPhone: `+9190000${60000 + i}`, status: 'active' })));
  const final = c.sections.filter((s) => s.term === 5 || (s.def.level === 'pg' && s.term === 3));
  const eligibleStudents = final.flatMap((s) => s.students);
  const driveDefs: [number, string, string, string, number | null, string, number][] = [
    [0, 'Associate Software Trainee (BCA)', 'placement', 'open', 4.2, 'BCA', 9], [1, 'Business Development Associate', 'placement', 'open', 3.6, 'BBA', 14], [2, 'Management Trainee, Retail Operations', 'placement', 'closed', 3.9, 'BBA', -12],
    [3, 'Ground Services Executive', 'placement', 'completed', 3.4, 'BAV', -30], [4, 'Junior Data Analyst', 'placement', 'open', 5.0, 'BCA', 21], [5, 'Operations Executive Intern', 'internship', 'open', null, 'BBA', 12],
    [6, 'Insurance Advisor Trainee', 'placement', 'completed', 3.0, 'BCM', -45], [7, 'Audit and Advisory Intern', 'internship', 'closed', null, 'BCM', -8],
  ];
  const drives = await k.ins<{ id: string; status: string; kind: string; companyId: string }>('placement_drives', driveDefs.map(([ci, roleTitle, kind, status, ctc, prog, dd]) => ({ companyId: companies[ci].id, title: `${companies[ci].name}: ${roleTitle} drive`, kind, roleTitle, ctcLpa: ctc, stipendMonthly: kind === 'internship' ? 12000 : null, location: ['Bengaluru', 'Bengaluru (Whitefield)', 'Bengaluru (Peenya)', 'Kempegowda International Airport'][ci % 4], description: `Open to final year ${prog} students. Aptitude test, interview and HR round.`, driveDate: addDays(c.today, dd), registrationClosesOn: addDays(c.today, dd - 3), minCgpa: 5.5, maxBacklogs: 1, programIds: [c.programs[prog].id], status, version: 1, createdBy: po })));
  for (const [di, d] of drives.entries()) {
    const pool = eligibleStudents.filter((s) => s.prog === driveDefs[di][5] || r.chance(0.1)).slice(0, 16);
    const regs = await k.ins<{ id: string; studentId: string }>('drive_registrations', pool.map((st, i) => ({ driveId: d.id, studentId: st.id, status: d.status === 'open' && i % 4 ? 'registered' : i % 5 === 0 ? 'rejected' : i % 3 === 0 ? 'selected' : 'shortlisted', cgpaAt: (5.4 + st.ability * 4).toFixed(2), backlogsAt: st.ability < 0.35 ? 1 : 0 })));
    if (d.status === 'open') continue;
    const rounds = await k.ins<{ id: string }>('drive_rounds', [['Aptitude test', 'aptitude'], ['Technical / functional interview', 'technical'], ['HR interview', 'hr']].map(([name, kind], seq) => ({ driveId: d.id, seq: seq + 1, name, kind, scheduledOn: addDays(c.today, driveDefs[di][6] + seq) })));
    await k.ins('round_results', regs.flatMap((rg, i) => rounds.slice(0, i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1).map((rd, j, arr) => ({ roundId: rd.id, registrationId: rg.id, result: j === arr.length - 1 && i % 3 === 2 ? 'fail' : 'pass', note: null }))), { returning: false });
    const selected = regs.filter((_, i) => i % 3 === 0);
    if (d.status === 'completed' && d.kind === 'placement') {
      await k.ins('placement_offers', selected.map((rg, i) => ({ driveId: d.id, registrationId: rg.id, studentId: rg.studentId, roleTitle: driveDefs[di][1], ctcLpa: driveDefs[di][4], status: i % 4 === 3 ? 'declined' : i % 4 === 2 ? 'offered' : 'accepted', offeredOn: addDays(c.today, driveDefs[di][6] + 5), respondBy: addDays(c.today, driveDefs[di][6] + 12), respondedAt: i % 4 === 2 ? null : at(addDays(c.today, driveDefs[di][6] + 8)), declineReason: i % 4 === 3 ? 'Accepted a higher offer elsewhere' : null })), { returning: false });
    }
  }
  // Internships (some from internship drives, some self-arranged) with diaries.
  const interns = c.students.filter((s) => s.term >= 3).filter((_, i) => i % 9 === 4).slice(0, 14);
  const internships = await k.ins<{ id: string; status: string }>('internships', interns.map((st, i) => ({ studentId: st.id, companyId: companies[i % companies.length].id, orgName: companies[i % companies.length].name, title: ['Marketing intern', 'Accounts intern', 'Data entry and analytics intern', 'HR intern', 'Operations intern'][i % 5], startsOn: addDays(c.today, i < 8 ? -40 : 10), endsOn: addDays(c.today, i < 8 ? 20 : 70), stipendMonthly: 8000 + (i % 3) * 2000, mentorUserId: c.teachers[i % c.teachers.length].id, industryMentor: 'Industry mentor, ' + companies[i % companies.length].name, status: i < 3 ? 'completed' : i < 8 ? 'ongoing' : i < 12 ? 'approved' : 'proposed', evaluationScore: i < 3 ? 78 + i * 6 : null, evaluationRemarks: i < 3 ? 'Punctual, quick learner. Good report.' : null, evaluatedBy: i < 3 ? c.teachers[i].id : null, employerFeedback: i < 3 ? 'Would hire again.' : null, version: 1 })));
  await k.ins('internship_diary', internships.filter((i) => ['ongoing', 'completed'].includes(i.status)).flatMap((it) => [0, 1, 2].map((n) => ({ internshipId: it.id, entryDate: addDays(c.today, -10 - n * 7), entry: ['Learned the invoicing workflow and prepared 20 entries.', 'Joined a client call; prepared the minutes.', 'Analysed weekly sales data in a spreadsheet and shared charts.'][n] }))), { returning: false });
}

export async function alumni(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const officer = c.byEmail.principal.id;
  const employers = ['Infosys', 'Wipro', 'HDFC Bank', 'Axis Bank', 'Deloitte India', 'KPMG India', 'IndiGo', 'Amazon Development Centre', 'Flipkart', 'Karnataka Bank', 'Own business', 'ICICI Lombard'];
  const designs = ['Analyst', 'Associate', 'Executive', 'Senior Executive', 'Assistant Manager', 'Team Lead', 'Founder'];
  const profiles = await k.ins<{ id: string }>('alumni_profiles', Array.from({ length: 42 }, (_, i) => {
    const female = i % 2 === 0;
    const prog = ['BBA', 'BCom', 'BCA', 'MBA', 'MCom'][i % 5];
    return { fullName: `${r.pick(female ? FEMALE : MALE)} ${r.pick(SURNAMES)}`, graduationYear: 2019 + (i % 7), program: prog, email: `alumnus${i + 1}@alumni.demo.kinetix.in`, phone: `+9190000${70000 + i}`, employer: employers[i % employers.length], designation: designs[i % designs.length], city: ['Bengaluru', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Mysuru', 'Dubai', 'Pune'][i % 7], bio: 'Happy to talk to students about careers and interviews.', directoryVisible: i % 6 !== 5, mentorAvailable: i % 3 === 0 };
  }));
  const events = await k.ins<{ id: string }>('alumni_events', [{ title: 'Annual Alumni Meet 2026', startsOn: '2026-12-12', venue: 'Soundarya Auditorium', description: 'Reunion lunch, felicitation of toppers and a career panel.', status: 'scheduled', createdBy: officer }, { title: 'Alumni Career Talk: Banking and Fintech', startsOn: addDays(c.today, -20), venue: 'Seminar Hall', description: 'Three alumni on careers in banking.', status: 'completed', createdBy: officer }, { title: 'Alumni Cricket Match', startsOn: '2027-01-24', venue: 'Campus ground', status: 'scheduled', createdBy: officer }]);
  await k.ins('alumni_event_rsvps', events.slice(0, 2).flatMap((e) => profiles.filter((_, i) => i % 3 !== 0).slice(0, 18).map((p) => ({ eventId: e.id, alumniId: p.id }))), { returning: false });
  const camps = await k.ins<{ id: string }>('alumni_campaigns', [{ name: 'Scholarship Corpus 2026-27', description: 'Raising funds for tuition support for first-generation learners.', goalPaise: rupees(1000000), startsOn: '2026-08-01', endsOn: '2027-03-31', status: 'active', receiptNote: 'Donations are eligible for 80G benefits (registration pending; demo data).', createdBy: officer }, { name: 'Library Digital Resources Fund', description: 'E-journal subscriptions for the library.', goalPaise: rupees(300000), startsOn: '2026-06-01', endsOn: '2026-09-30', status: 'closed', createdBy: officer }]);
  const pledges = await k.ins<{ id: string; alumniId: string }>('alumni_pledges', profiles.slice(0, 10).map((p, i) => ({ campaignId: camps[i % 2].id, alumniId: p.id, donorName: `Alumnus ${i + 1}`, amountPaise: rupees([5000, 10000, 25000, 2500, 15000][i % 5]), pledgedOn: addDays(c.today, -30 + i), dueOn: addDays(c.today, 20 + i), status: i < 4 ? 'fulfilled' : 'open', createdBy: officer })));
  let n = 0;
  await k.ins('alumni_donations', [
    ...pledges.slice(0, 4).map((p, i) => ({ campaignId: camps[i % 2].id, alumniId: p.alumniId, pledgeId: p.id, donorName: `Alumnus ${i + 1}`, donorPan: `ABCPK${1000 + i}F`, amountPaise: rupees([5000, 10000, 25000, 2500][i]), mode: ['upi', 'bank_transfer', 'cheque', 'upi'][i], reference: `REF${88000 + i}`, receivedOn: addDays(c.today, -12 + i), receiptSerial: `ALM/2026-27/${String(++n).padStart(4, '0')}`, recordedBy: officer })),
    ...[1, 2, 3, 4, 5].map((i) => ({ campaignId: camps[0].id, alumniId: profiles[10 + i].id, donorName: `Alumnus ${10 + i}`, amountPaise: rupees(1000 * i), mode: 'upi', reference: `UPI${77000 + i}`, receivedOn: addDays(c.today, -i * 3), receiptSerial: `ALM/2026-27/${String(++n).padStart(4, '0')}`, recordedBy: officer })),
  ], { returning: false });
  const vol = await k.ins<{ id: string }>('alumni_volunteer_opportunities', [{ title: 'Mock interview panel for final-year students', description: 'Two evenings in November.', startsOn: addDays(c.today, 28), slots: 12, status: 'open', createdBy: officer }, { title: 'Guest lecture: your career path', description: '45 minutes, in person or online.', startsOn: addDays(c.today, 40), slots: 6, status: 'open', createdBy: officer }]);
  await k.ins('alumni_volunteer_signups', profiles.slice(0, 5).map((p, i) => ({ opportunityId: vol[i % 2].id, alumniId: p.id, note: 'Available on weekday evenings' })), { returning: false });
  const mentors = profiles.filter((_, i) => i % 3 === 0);
  await k.ins('mentoring_requests', c.students.filter((s) => s.term === 5).slice(0, 8).map((st, i) => ({ studentId: st.id, alumniId: mentors[i % mentors.length].id, topic: ['Preparing for banking interviews', 'MBA entrance advice', 'Starting a small business', 'Moving into data analytics', 'Aviation career paths', 'Taxation careers', 'CA or MBA?', 'Resume review'][i], message: 'I would be grateful for 30 minutes of your time.', status: ['pending', 'accepted', 'completed', 'declined', 'pending', 'accepted', 'pending', 'completed'][i], respondedAt: i % 2 ? at(addDays(c.today, -3)) : null })), { returning: false });
}

export async function campusLife(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const clubDefs: [string, string, string][] = [['Entrepreneurship Cell', 'business', 'Startup talks, pitch days and a campus market.'], ['Kannada Sahitya Vedike', 'cultural', 'Literary events, poetry and Rajyotsava programmes.'], ['Coding Club', 'technical', 'Weekly coding practice and hackathons.'], ['NSS Unit', 'service', 'Community service camps and blood donation drives.'], ['Cultural and Dance Club', 'cultural', 'Dance, music and annual day performances.'], ['Aviation Interest Group', 'technical', 'Airport visits, simulations and talks from pilots.']];
  const clubs = await k.ins<{ id: string }>('clubs', clubDefs.map(([name, category, description], i) => ({ name, category, description, facultyCoordinatorId: c.teachers[i + 4].id, active: true })));
  const members = c.students.filter((_, i) => i % 3 === 1);
  await k.ins('club_members', members.slice(0, 120).map((st, i) => ({ clubId: clubs[i % clubs.length].id, studentId: st.id, role: i < 12 ? ['president', 'secretary'][i % 2] : 'member', status: i % 17 === 0 ? 'pending' : 'approved', decidedBy: i % 17 === 0 ? null : c.teachers[0].id, decidedAt: i % 17 === 0 ? null : at(addDays(c.today, -30)) })), { returning: false });
  const acts = await k.ins<{ id: string; clubId: string }>('club_activities', clubs.flatMap((cl, i) => [{ clubId: cl.id, title: ['Pitch Day', 'Kavi Gosthi (poetry evening)', 'Hackathon: 6 hours', 'Blood donation camp', 'Rangoli and dance rehearsal', 'Airport visit briefing'][i], description: 'Open to all students.', activityOn: addDays(c.today, -14 - i * 3), points: 5 + i, createdBy: c.teachers[i + 4].id }, { clubId: cl.id, title: 'Weekly meet', description: 'Plans for the month.', activityOn: addDays(c.today, -5 - i), points: 2, createdBy: c.teachers[i + 4].id }]));
  const approved = members.slice(0, 120).filter((_, i) => i % 17 !== 0);
  await k.ins('club_activity_attendance', acts.flatMap((a) => approved.filter((_, i) => (i + a.clubId.charCodeAt(0)) % 3 === 0).slice(0, 14).map((st) => ({ activityId: a.id, studentId: st.id, points: 3 }))), { returning: false });

  const ev = await k.ins<{ id: string }>('campus_events', [
    { title: 'Aarambh 2026: Freshers Day', description: 'Welcome programme for first-year students.', eventType: 'cultural', venue: 'Auditorium', capacity: 400, startsAt: at('2026-09-05', '10:00'), endsAt: at('2026-09-05', '16:00'), audience: 'all', feePaise: 0, status: 'completed', createdBy: c.byEmail.principal.id },
    { title: 'Inter-college Management Fest: Vyapara', description: 'Business quiz, marketing events and a stock market game.', eventType: 'fest', venue: 'Campus', capacity: 300, startsAt: at(addDays(c.today, 14), '09:30'), endsAt: at(addDays(c.today, 14), '17:30'), audience: 'all', feePaise: rupees(150), status: 'open', createdBy: c.teachers[4].id },
    { title: 'Workshop: Excel for Finance', description: 'Hands-on session in the computer lab.', eventType: 'workshop', venue: 'Computer Lab 1', capacity: 40, startsAt: at(addDays(c.today, 6), '14:00'), endsAt: at(addDays(c.today, 6), '16:30'), audience: 'students', feePaise: 0, status: 'open', createdBy: c.teachers[10].id },
    { title: 'Blood Donation Camp (NSS)', description: 'With Rotary Blood Bank, Bengaluru.', eventType: 'service', venue: 'Seminar Hall', capacity: 150, startsAt: at(addDays(c.today, -9), '10:00'), endsAt: at(addDays(c.today, -9), '15:00'), audience: 'all', feePaise: 0, status: 'completed', createdBy: c.teachers[7].id },
    { title: 'Aviation Open House', description: 'Simulator demo and talks by pilots, for prospective students and parents.', eventType: 'outreach', venue: 'Aviation Simulation Lab', capacity: 120, startsAt: at(addDays(c.today, 24), '10:00'), endsAt: at(addDays(c.today, 24), '13:00'), audience: 'all', feePaise: 0, status: 'open', createdBy: c.byEmail['hod.aviation'].id },
  ]);
  const regs = await k.ins<{ id: string; eventId: string }>('event_registrations', ev.flatMap((e, ei) => c.students.filter((_, i) => (i + ei) % (ei === 0 ? 2 : 4) === 0).slice(0, ei === 0 ? 120 : 40).map((st) => ({ eventId: e.id, studentId: st.id, registeredBy: st.userId ?? c.byEmail.principal.id, status: 'registered', qrToken: `QR-${e.id.slice(0, 6)}-${st.rollNo}`, checkedInAt: ei === 0 || ei === 3 ? at('2026-09-05', '10:20') : null }))));
  await k.ins('event_feedback', regs.filter((rg) => rg.eventId === ev[0].id).slice(0, 40).map((rg, i) => ({ eventId: rg.eventId, registrationId: rg.id, rating: 3 + (i % 3), comment: i % 4 === 0 ? 'Loved the performances.' : null })), { returning: false });
  void r;
}

export async function mentoring(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const mentors = c.teachers.slice(0, 12);
  const assigned = c.students.filter((s) => s.term >= 1);
  await k.ins('mentor_assignments', assigned.map((st, i) => ({ studentId: st.id, mentorUserId: mentors[i % mentors.length].id, startedOn: '2026-08-10', assignedBy: c.byEmail.principal.id })), { returning: false });
  const sessions = await k.ins<{ id: string }>('mentoring_sessions', assigned.filter((_, i) => i % 4 === 0).map((st, i) => ({ studentId: st.id, mentorUserId: mentors[(assigned.indexOf(st)) % mentors.length].id, heldOn: addDays(c.today, -(i % 40) - 2), mode: ['in_person', 'in_person', 'online', 'phone'][i % 4], summary: st.presence < 0.74 ? 'Discussed attendance and reasons for absence. Agreed on a weekly check-in.' : r.pick(['Reviewed IA marks and study plan.', 'Talked about internship options.', 'Discussed career goals after graduation.', 'Checked in on hostel and transport issues.']), privateNotes: st.presence < 0.74 ? 'Travels 2 hours each way; family business support needed on weekends.' : null, followUpOn: st.presence < 0.74 ? addDays(c.today, 5) : null })));
  void sessions;
  const risky = c.students.filter((s) => s.presence < 0.74).slice(0, 14);
  await k.ins('intervention_plans', risky.map((st, i) => ({ studentId: st.id, mentorUserId: mentors[assigned.indexOf(st) % mentors.length].id, goal: i % 2 ? 'Raise attendance above 75 percent before the SEE' : 'Pass all internal assessments with at least 40 percent', actions: J([{ action: 'Weekly check-in with mentor', status: 'ongoing' }, { action: 'Remedial class for the weak subject', status: i % 3 === 0 ? 'done' : 'planned' }]), reviewOn: addDays(c.today, 14 + i), status: i < 11 ? 'active' : 'closed', outcome: i >= 11 ? 'Attendance improved to 78 percent' : null, outcomeRating: i >= 11 ? 4 : null, closedAt: i >= 11 ? at(addDays(c.today, -2)) : null })), { returning: false });
}

export async function skills(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const rec = c.byEmail.principal.id;
  const sk = await k.ins<{ id: string; code: string }>('skills', [['COM', 'Communication', 'Soft skills'], ['TEAM', 'Teamwork', 'Soft skills'], ['EXCEL', 'Spreadsheet analysis', 'Digital'], ['ACC', 'Accounting software (Tally)', 'Digital'], ['SQL', 'Databases and SQL', 'Technical'], ['PY', 'Programming in Python', 'Technical'], ['LEAD', 'Leadership', 'Soft skills'], ['ETH', 'Business ethics', 'Values'], ['ENT', 'Entrepreneurial thinking', 'Business'], ['CS', 'Customer service', 'Aviation']].map(([code, name, category]) => ({ code, name, category, description: `${name} as a graduate attribute.`, active: true })));
  const sec3 = c.sections.find((s) => s.prog === 'BCA' && s.term === 3)!;
  await k.ins('skill_maps', [{ skillId: sk[4].id, kind: 'subject', ref: sec3.subjects[1].id }, { skillId: sk[5].id, kind: 'subject', ref: c.sections.find((s) => s.prog === 'BCA' && s.term === 5)!.subjects[2].id }, { skillId: sk[0].id, kind: 'subject', ref: c.sections.find((s) => s.prog === 'BBA' && s.term === 3)!.subjects[4].id }, { skillId: sk[3].id, kind: 'subject', ref: c.sections.find((s) => s.prog === 'BCM' && s.term === 3)!.subjects[1].id }], { returning: false });
  await k.ins('skill_evidence', c.students.filter((_, i) => i % 5 === 0).flatMap((st, i) => [0, 1].map((n) => ({ skillId: sk[(i + n * 3) % sk.length].id, studentId: st.id, level: 1 + ((i + n) % 4), title: ['Completed Excel workshop', 'Led the club hackathon team', 'NSS camp volunteer', 'Won the business quiz', 'Internship project report'][(i + n) % 5], note: 'Verified by the coordinator.', recordedBy: rec }))), { returning: false });
  const goalsAndItems = [[4, 'Quality Education'], [8, 'Decent Work and Economic Growth'], [9, 'Industry, Innovation and Infrastructure'], [5, 'Gender Equality'], [12, 'Responsible Consumption and Production'], [13, 'Climate Action']] as const;
  const items = [...c.sections.filter((s) => s.term === 3).flatMap((s) => s.subjects.slice(0, 2)), ...c.sections.filter((s) => s.term === 5).flatMap((s) => s.subjects.slice(0, 1))];
  await k.ins('sdg_tags', items.slice(0, 12).map((sub, i) => ({ sdgNumber: goalsAndItems[i % goalsAndItems.length][0], itemType: 'subject', itemId: sub.id, note: `${sub.name} contributes to ${goalsAndItems[i % goalsAndItems.length][1]}.`, taggedBy: rec })), { returning: false });
  await k.ins('outcome_passports', c.students.filter((s) => s.term === 5).slice(0, 6).map((st, i) => ({ studentId: st.id, verifyToken: `SIMS-PASS-${1000 + i}-${r.int(100000, 999999)}`, verifiedBy: i < 4 ? rec : null, verifiedAt: i < 4 ? at(addDays(c.today, -i)) : null })), { returning: false });
}
void FEMALE;
