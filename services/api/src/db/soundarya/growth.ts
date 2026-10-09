/** Admissions growth (agents, commissions, interviews, online entrance test) and HR lifecycle (appraisal, training, offers, onboarding, exit). */
import { eq } from 'drizzle-orm';
import { AgentsService } from '../../admissions/agents.service.js';
import { EnquiriesService } from '../../admissions/enquiries.service.js';
import { InterviewsService } from '../../admissions/interviews.service.js';
import { OnlineTestService } from '../../admissions/online-test.service.js';
import { APPRAISAL_CATEGORIES, gradeFor, percentOf, type AppraisalScores } from '../../hr/appraisal-math.js';
import { ONBOARDING_CHECKLIST } from '../../hr/onboarding-checklist.js';
import { applications, entranceQuestions } from '../schema.js';
import type { Ctx } from './ctx.js';
import { DOMAIN } from './data.js';
import { addDays, J, rupees } from './kit.js';
import { service, withTenant } from './nest.js';

const QUESTIONS: [string, string, string[], number][] = [
  ['Quantitative aptitude', 'A shop gives 20% off a Rs. 1,500 shirt. What is the selling price?', ['Rs. 1,100', 'Rs. 1,200', 'Rs. 1,300', 'Rs. 1,250'], 1],
  ['Quantitative aptitude', 'The simple interest on Rs. 5,000 at 8% a year for 3 years is', ['Rs. 1,000', 'Rs. 1,200', 'Rs. 1,400', 'Rs. 1,600'], 1],
  ['Quantitative aptitude', 'If 6 workers finish a job in 10 days, how many days will 15 workers need?', ['2', '4', '6', '25'], 1],
  ['Quantitative aptitude', 'What is 35% of 240?', ['72', '80', '84', '96'], 2],
  ['Quantitative aptitude', 'The ratio 3:5 expressed as a percentage of the second to the first is', ['60%', '120%', '166.67%', '40%'], 2],
  ['Quantitative aptitude', 'The average of 12, 18, 24 and 30 is', ['20', '21', '22', '24'], 1],
  ['Logical reasoning', 'Find the next number: 2, 6, 12, 20, 30, ?', ['38', '40', '42', '44'], 2],
  ['Logical reasoning', 'All roses are flowers. Some flowers fade quickly. Which is certainly true?', ['All roses fade quickly', 'Some roses are flowers', 'No flower is a rose', 'Roses never fade'], 1],
  ['Logical reasoning', 'If CAT is coded as DBU, how is DOG coded?', ['EPH', 'EOH', 'DPH', 'FPI'], 0],
  ['Logical reasoning', 'A is taller than B, B is taller than C. Who is the shortest?', ['A', 'B', 'C', 'Cannot say'], 2],
  ['Logical reasoning', 'Which one does not belong: Mango, Apple, Potato, Banana?', ['Mango', 'Apple', 'Potato', 'Banana'], 2],
  ['Logical reasoning', 'Pointing to a man, a woman says "He is my mother\'s only son." How is he related to her?', ['Father', 'Brother', 'Uncle', 'Cousin'], 1],
  ['English', 'Choose the correct word: She is good ___ mathematics.', ['in', 'at', 'on', 'with'], 1],
  ['English', 'The synonym of "diligent" is', ['Lazy', 'Hardworking', 'Careless', 'Angry'], 1],
  ['English', 'The antonym of "scarce" is', ['Rare', 'Plentiful', 'Costly', 'Small'], 1],
  ['English', 'Pick the correctly spelt word.', ['Recieve', 'Receive', 'Receve', 'Recive'], 1],
  ['English', 'Fill in: If I ___ you, I would apologise.', ['am', 'was', 'were', 'be'], 2],
  ['English', 'One word for "a person who speaks many languages" is', ['Linguist', 'Polyglot', 'Orator', 'Interpreter'], 1],
  ['General awareness', 'Which institution regulates banking in India?', ['SEBI', 'RBI', 'IRDAI', 'NABARD'], 1],
  ['General awareness', 'GST was introduced in India in', ['2014', '2015', '2017', '2019'], 2],
  ['General awareness', 'The headquarters of the International Civil Aviation Organization is in', ['Geneva', 'Montreal', 'London', 'Paris'], 1],
  ['General awareness', 'Bengaluru is the capital of', ['Tamil Nadu', 'Karnataka', 'Kerala', 'Telangana'], 1],
  ['General awareness', 'The full form of AI is', ['Applied Internet', 'Artificial Intelligence', 'Automated Input', 'Analog Interface'], 1],
  ['General awareness', 'Which of these is a financial statement?', ['Balance sheet', 'Time table', 'Mark sheet', 'Pay slip'], 0],
];

export async function admissionsGrowth(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const officer = c.byEmail.admissions.id;
  const actor = { tenantId: c.tenantId, userId: officer };
  const agents = await service(AgentsService);
  const enq = await service(EnquiriesService);
  const interviews = await service(InterviewsService);
  const online = await service(OnlineTestService);

  // Agents and referral partners; the seeded referral enquiries are credited to them and re-scored.
  const defs = [
    { name: 'Karnataka Education Consultants', kind: 'agent' as const, phone: '+919000011001', email: 'info@kec.demo.kinetix.in', commissionPaise: rupees(3000), referralCode: 'KEC2026' },
    { name: 'Vidya Mitra Partner Network', kind: 'partner' as const, phone: '+919000011002', email: 'desk@vidyamitra.demo.kinetix.in', commissionPaise: rupees(2500), referralCode: 'VIDYA26' },
    { name: 'Sri Venkateshwara PUC College', kind: 'partner' as const, phone: '+919000011003', email: 'principal@svpuc.demo.kinetix.in', commissionPaise: rupees(2000), referralCode: 'SVPUC26' },
    { name: 'Soundarya Alumni Ambassadors', kind: 'agent' as const, phone: '+919000011004', email: 'alumni@soundarya.demo.kinetix.in', commissionPaise: rupees(1000), referralCode: 'ALUMNI26' },
  ];
  const made = [];
  for (const d of defs) made.push(await withTenant(c.tenantId, (tx) => agents.create(tx, actor, d)));
  const referred = await k.q<{ id: string }>("select id from enquiries where tenant_id = $1 and source = 'referral' order by created_at", [c.tenantId]);
  for (const [i, e] of referred.entries()) {
    await k.q('update enquiries set agent_id = $2 where id = $1', [e.id, made[i % made.length].id]);
    await withTenant(c.tenantId, (tx) => enq.rescore(tx, e.id));
  }

  // Commissions on enrolled students of this year's intake: some paid out, some still owed.
  const enrolled = await k.q<{ id: string }>("select id from applications where tenant_id = $1 and application_no like 'BBA26-%' and student_id is not null order by application_no limit 8", [c.tenantId]);
  for (const [i, a] of enrolled.entries()) {
    const agent = made[i % made.length];
    await k.q('update applications set agent_id = $2 where id = $1', [a.id, agent.id]);
    await k.ins('agent_commissions', { agentId: agent.id, applicationId: a.id, amountPaise: agent.commissionPaise, status: i < 4 ? 'paid' : 'accrued', paidOn: i < 4 ? addDays(c.today, -10 - i) : null, note: i < 4 ? 'Paid by bank transfer' : null }, { returning: false });
  }

  // Interviews for the BBA early round: six held, four coming up.
  const [cycleB] = await k.q<{ id: string }>("select id from admission_cycles where tenant_id = $1 and name like 'BBA 2027-28%'", [c.tenantId]);
  const [cycleC] = await k.q<{ id: string }>("select id from admission_cycles where tenant_id = $1 and name like 'BCA 2027-28%'", [c.tenantId]);
  const shortlisted = await k.q<{ id: string }>("select id from applications where cycle_id = $1 and status in ('offered', 'accepted', 'waitlisted', 'eligible') order by merit_rank nulls last, application_no limit 10", [cycleB.id]);
  const hodMgmt = c.byEmail['hod.management'];
  const hodCom = c.byEmail['hod.commerce'];
  const panel = [{ userId: hodMgmt.id, name: hodMgmt.name }, { userId: hodCom.id, name: hodCom.name }, { userId: officer, name: c.byEmail.admissions.name }];
  const criteria = (s: number) => [
    { criterion: 'Communication', score: Math.min(10, s), max: 10 },
    { criterion: 'Subject aptitude', score: Math.min(10, Math.max(0, s - 1)), max: 10 },
    { criterion: 'Motivation and clarity of goals', score: Math.min(10, Math.max(0, s + (r.chance(0.5) ? 1 : -1))), max: 10 },
  ];
  for (const [i, a] of shortlisted.entries()) {
    const past = i < 6;
    const slot = new Date(`${addDays(c.today, past ? -(i + 1) : i - 5)}T${['10:00', '11:00', '14:30'][i % 3]}:00+05:30`).toISOString();
    const iv = await withTenant(c.tenantId, (tx) => interviews.schedule(tx, actor, { applicationId: a.id, slotAt: slot, venue: `Conference Room ${1 + (i % 2)}`, panel }));
    if (!past) continue;
    const base = r.int(5, 9);
    for (const p of panel.slice(0, 2 + (i % 2))) await withTenant(c.tenantId, (tx) => interviews.submitSheet(tx, { tenantId: c.tenantId, userId: p.userId }, iv.id, p.name, { criteria: criteria(base), remarks: base >= 8 ? 'Confident and well prepared.' : 'Needs to work on communication.' }));
    const outcome = i === 5 ? 'rejected' : i === 4 ? 'waitlisted' : 'selected';
    await withTenant(c.tenantId, (tx) => interviews.complete(tx, actor, iv.id, outcome, outcome === 'rejected' ? 'Did not meet the programme expectations.' : null));
  }

  // Question bank and an online aptitude test for the BCA round: eight finished, two in progress.
  await k.ins('entrance_questions', QUESTIONS.map(([topic, question, options, correctIndex]) => ({ topic, question, options: J(options), correctIndex, marks: 1 })), { returning: false });
  const test = await k.one<{ id: string }>('entrance_tests', { cycleId: cycleC.id, name: 'Soundarya Online Aptitude Test (BCA 2027)', testDate: addDays(c.today, -1), startsAt: '10:00', durationMinutes: 30, maxScore: 50, passScore: 15, venue: 'Online', createdBy: officer });
  await k.q("update applications set fee_status = 'paid' where cycle_id = $1", [cycleC.id]);
  await withTenant(c.tenantId, (tx) => online.configure(tx, actor, test.id, { questionCount: 12, negativeMarks: 0.25, topic: null, open: true }));
  await withTenant(c.tenantId, async (tx) => {
    const apps = await tx.select().from(applications).where(eq(applications.cycleId, cycleC.id));
    const bank = new Map((await tx.select().from(entranceQuestions)).map((q) => [q.id, q]));
    for (const [i, app] of apps.slice(0, 10).entries()) {
      const run = await online.start(tx, app, test.id);
      if (i >= 8) continue;
      const skill = r.gauss(0.6, 0.18);
      const answers: Record<string, number> = {};
      for (const q of run.questions) {
        if (r.chance(0.08)) continue;
        const right = bank.get(q.id)!.correctIndex;
        answers[q.id] = r.chance(skill) ? right : (right + 1 + r.int(0, 2)) % 4;
      }
      await online.submit(tx, app, test.id, answers);
    }
  });
}

export async function hrLifecycle(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const hr = c.byEmail.hr.id;
  const principal = c.byEmail.principal.id;
  const hods = ['hod.management', 'hod.commerce', 'hod.computers'].map((e) => c.byEmail[e]);

  // Appraisals: last year's cycle is done; this year's is open with forms at every step.
  const [past, cur] = await k.ins<{ id: string }>('appraisal_cycles', [
    { period: '2025-26', opensOn: '2025-10-01', closesOn: '2025-12-31', status: 'closed' },
    { period: '2026-27', opensOn: addDays(c.today, -20), closesOn: addDays(c.today, 40), status: 'open' },
  ]);
  const scoreSet = (lo: number, hi: number, evidence: boolean): AppraisalScores =>
    Object.fromEntries(APPRAISAL_CATEGORIES.map((cat) => [cat.key, { score: Math.round(cat.max * (lo + (hi - lo) * r.next())), ...(evidence ? { evidence: `${cat.label}: documents attached in the file room.` } : {}) }]));
  const faculty = c.teachers.slice(0, 12);
  for (const [i, t] of faculty.entries()) {
    const self = scoreSet(0.65, 0.95, true);
    const hodScores = Object.fromEntries(Object.entries(self).map(([key, v]) => [key, { score: Math.max(0, v.score - r.int(0, 5)) }])) as AppraisalScores;
    const pct = percentOf(hodScores);
    await k.ins('appraisals', { cycleId: past.id, userId: t.id, status: 'finalised', selfScores: J(self), hodScores: J(hodScores), hodRemarks: 'Consistent contribution through the year.', hodId: hods[i % hods.length].id, finalScore: pct, grade: gradeFor(pct), principalRemarks: 'Reviewed and agreed.', principalId: principal }, { returning: false });
    // This year: a mix of draft, submitted and reviewed.
    const step = i % 4;
    if (i >= 10) continue;
    const base = { cycleId: cur.id, userId: t.id };
    if (step === 0) await k.ins('appraisals', { ...base, status: 'draft', selfScores: J({ teaching_learning: { score: 70 } }) }, { returning: false });
    else if (step === 1) await k.ins('appraisals', { ...base, status: 'self_submitted', selfScores: J(scoreSet(0.6, 0.9, true)) }, { returning: false });
    else await k.ins('appraisals', { ...base, status: 'hod_reviewed', selfScores: J(self), hodScores: J(hodScores), hodRemarks: 'Good progress; research output to improve.', hodId: hods[i % hods.length].id }, { returning: false });
  }

  // Training and FDP records.
  const programmes: [string, string, string, number][] = [
    ['FDP on outcome-based education and NBA accreditation', 'fdp', 'NITTTR Bengaluru', 30],
    ['Workshop on research methodology and SPSS', 'workshop', 'Bangalore University', 12],
    ['Orientation on NEP 2020 and the BCU scheme', 'course', 'Bengaluru City University', 6],
    ['National conference on digital finance', 'conference', 'Christ University', 16],
    ['FDP on teaching with case studies', 'fdp', 'IIM Bangalore (Executive Education)', 24],
    ['Course on Python for data analysis', 'course', 'NPTEL / IIT Madras', 40],
    ['Workshop on aviation safety management', 'workshop', 'Indian Aviation Academy', 8],
  ];
  const trainings = faculty.flatMap((t, i) => [0, 1, 2].slice(0, 1 + (i % 3)).map((j) => {
    const [title, kind, organiser, hours] = programmes[(i + j * 3) % programmes.length];
    const start = addDays(c.today, -r.int(15, 330));
    return { userId: t.id, title, kind, organiser, startsOn: start, endsOn: addDays(start, Math.max(0, Math.ceil(hours / 6) - 1)), hours, certificateRef: `CERT-${1000 + i * 7 + j}`, verified: !(i % 5 === 4 && j === 0) };
  }));
  await k.ins('training_records', trainings, { returning: false });

  // Offer letters for recruitment applicants who reached the offer stage.
  const offered = await k.q<{ id: string; stage: string; title: string }>("select a.id, a.stage, o.title from job_applicants a join job_openings o on o.id = a.opening_id where a.tenant_id = $1 and a.stage in ('offered', 'offer', 'hired') order by a.created_at", [c.tenantId]);
  await k.ins('offer_letters', offered.map((a, i) => ({ applicantId: a.id, offerNo: `OFR/2026/${String(i + 1).padStart(4, '0')}`, position: a.title, annualCtcPaise: rupees(600000 + i * 120000), joiningOn: addDays(c.today, 30 + i * 3), validUntil: addDays(c.today, 14), terms: 'Probation of six months. Subject to verification of original certificates and a satisfactory medical report.', status: a.stage === 'hired' ? 'accepted' : 'issued', issuedBy: hr })), { returning: false });

  // Onboarding checklists for the two most recent joiners.
  for (const [n, t] of c.teachers.slice(-2).entries()) {
    const base = addDays(c.today, -6 - n * 3);
    await k.ins('onboarding_items', ONBOARDING_CHECKLIST.map(([title, owner, days], i) => ({ userId: t.id, title, owner, dueOn: addDays(base, days), done: i < 5 - n * 3, doneAt: i < 5 - n * 3 ? new Date(`${addDays(base, days)}T12:00:00+05:30`) : null, doneBy: i < 5 - n * 3 ? (owner === 'Employee' ? t.id : hr) : null })), { returning: false });
  }

  // Exit: one lecturer relieved last month, one resignation in clearance, one just submitted.
  const gone = await k.one<{ id: string }>('users', { fullName: 'Latha Bhat', email: `latha.bhat@${DOMAIN}`, passwordHash: c.hash, status: 'disabled' });
  await k.ins('user_roles', { userId: gone.id, role: 'teacher', campusId: c.campusId }, { returning: false });
  await k.ins('staff_profiles', { userId: gone.id, employeeCode: 'SIMS-901', departmentId: c.departments['Languages'], designationId: c.designations['Assistant Professor'], dateOfJoining: '2019-06-15', dateOfLeaving: addDays(c.today, -20), status: 'exited' }, { returning: false });
  const depts = ['Department', 'Library', 'Accounts', 'IT', 'Hostel', 'HR'];
  const left = await k.one<{ id: string }>('separations', { userId: gone.id, resignedOn: addDays(c.today, -80), noticeDays: 60, lastWorkingDay: addDays(c.today, -20), reason: 'Moving abroad with family', status: 'relieved', noticeShortfallDays: 0, settlementPaise: rupees(86400), settlementNote: 'Salary up to the last working day, leave encashment of 14 days, less library fine of Rs. 400. Paid by bank transfer.', relievedOn: addDays(c.today, -20) });
  await k.ins('exit_clearances', depts.map((department, i) => ({ separationId: left.id, department, status: 'cleared', duesPaise: department === 'Library' ? rupees(400) : 0, remarks: department === 'Library' ? 'Two overdue books returned' : null, clearedBy: hr, clearedAt: new Date(`${addDays(c.today, -24 - i)}T12:00:00+05:30`) })), { returning: false });

  const [leaver, newer] = c.teachers.slice(-4, -2);
  const going = await k.one<{ id: string }>('separations', { userId: leaver.id, resignedOn: addDays(c.today, -9), noticeDays: 30, lastWorkingDay: addDays(c.today, 21), reason: 'Offer from a university closer to home', status: 'clearance', noticeShortfallDays: 0 });
  await k.ins('exit_clearances', depts.map((department, i) => ({ separationId: going.id, department, status: i < 2 ? 'cleared' : 'pending', duesPaise: department === 'Library' ? rupees(1200) : 0, remarks: i < 2 ? 'Cleared' : null, clearedBy: i < 2 ? hr : null, clearedAt: i < 2 ? new Date(`${addDays(c.today, -3)}T12:00:00+05:30`) : null })), { returning: false });
  await k.ins('separations', { userId: newer.id, resignedOn: addDays(c.today, -1), noticeDays: 30, lastWorkingDay: addDays(c.today, 29), reason: 'Higher studies', status: 'submitted' }, { returning: false });
}
