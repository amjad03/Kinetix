/**
 * The placements pass on the demo college: the cell's settings (dream from 6 LPA, super dream from 10, 14 internship
 * credits), gender and class 10 / 12 records for the final year, the recruiter relationship (stages, an officer per
 * company, calls, visits and follow-ups, three due), stricter eligibility on two drives and a women-only fellowship,
 * placement documents in every state, a placement training programme with sessions, attendance and aptitude scores,
 * internship hours and AICTE credits, five outgoing batches (2022 to 2026) with offers, higher studies, competitive
 * exams and ventures so the NIRF, NAAC 5.2 and AISHE tables have every year, NATS apprenticeships with stipends and
 * the DBT share, and alumni referrals.
 */
import { ObjectStorage, bufferStream } from '../../storage/storage.service.js';
import { natsGovtSharePaise, NATS_DEFAULTS } from '../../placements/placement-pass.logic.js';
import type { Ctx } from './ctx.js';
import { FEMALE, MALE, SURNAMES } from './data.js';
import { addDays, at } from './kit.js';
import { service } from './nest.js';

const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

/** Package (LPA) of the i-th placed graduate of a programme: mostly regular, a few dream and super-dream offers. */
const ctcOf = (prog: string, i: number) => {
  const base: Record<string, number> = { BCA: 4.2, BBA: 3.6, BCM: 3.3, BAV: 3.4, MBA: 6.2, MCM: 4.4 };
  if (i % 11 === 3) return 7.5;
  if (i % 17 === 5) return 11;
  return Math.round(((base[prog] ?? 3.5) + (i % 5) * 0.35) * 100) / 100;
};

export async function placementsPass(c: Ctx, o: { files?: boolean } = {}): Promise<void> {
  const k = c.kit;
  const t = c.tenantId;
  const officer = c.byEmail.placements?.id ?? c.byEmail.principal.id;
  const ug = Object.entries(c.programs).filter(([, p]) => p.def.level === 'ug' || p.def.level === 'pg');
  if (!ug.length) return;
  const today = c.today;
  const d = (n: number) => addDays(today, n);

  // ---- settings ---------------------------------------------------------------------------------
  await k.q(
    `update module_settings set settings = jsonb_set(settings, '{rules}', coalesce(settings->'rules', '{}'::jsonb) || $2::jsonb) where tenant_id = $1 and module = 'placements'`,
    [t, JSON.stringify({ dreamMinLpa: 6, superDreamMinLpa: 10, internshipCreditsRequired: 14, internshipHoursPerCredit: 45, requiredDocs: 'resume', notifyEligibleOnOpen: true, natsStipendGraduate: NATS_DEFAULTS.minGraduate, natsStipendDiploma: NATS_DEFAULTS.minDiploma, natsGovtSharePct: 50 })],
  );

  // ---- the final year: gender, joining year, class 10 and 12 ----------------------------------------
  const final = c.students.filter((s) => (s.term === 5 && c.programs[s.prog]?.def.level === 'ug') || (s.term === 3 && c.programs[s.prog]?.def.level === 'pg'));
  await k.q(
    `insert into student_profiles (tenant_id, student_id, gender) select $1, x.id, x.g from unnest($2::uuid[], $3::text[]) as x(id, g)
     on conflict (student_id) do update set gender = coalesce(student_profiles.gender, excluded.gender)`,
    [t, c.students.map((s) => s.id), c.students.map((s) => (s.female ? 'female' : 'male'))],
  );
  const joined = (s: { term: number; prog: string }) => (c.programs[s.prog]?.def.level === 'pg' ? 2025 + (s.term >= 3 ? 0 : 1) : 2026 - Math.floor((s.term - 1) / 2));
  for (const s of final) await k.q(`update students set enrolled_on = $2 where id = $1 and enrolled_on is null`, [s.id, `${joined(s)}-08-01`]);
  const hasPrior = new Set((await k.q<{ studentId: string }>(`select distinct student_id from student_prior_education where tenant_id = $1 and student_id is not null`, [t])).map((x) => x.studentId));
  const schools = ['Vidya PU College, Bengaluru', 'Sharada PU College, Mysuru', 'National PU College, Tumakuru', 'MES PU College, Bengaluru', 'Vijaya PU College, Mangaluru'];
  await k.ins(
    'student_prior_education',
    final.filter((s) => !hasPrior.has(s.id)).flatMap((s, i) => {
      const twelfth = 2024 - (i % 13 === 4 ? 2 : 0); // one in thirteen took two years out before joining
      return [
        { studentId: s.id, level: 'secondary', institution: `Government High School, ${['Jayanagar', 'Malleswaram', 'Yelahanka', 'Hebbal'][i % 4]}`, board: 'Karnataka SSLC', passingYear: twelfth - 2, percentage: (62 + s.ability * 34).toFixed(2), medium: i % 5 === 0 ? 'Kannada' : 'English' },
        { studentId: s.id, level: 'puc', institution: schools[i % schools.length], board: 'Karnataka PUC', passingYear: twelfth, percentage: (55 + s.ability * 38).toFixed(2), medium: 'English' },
      ];
    }),
    { returning: false },
  );

  // ---- recruiter relationship ---------------------------------------------------------------------
  const companies = await k.q<{ id: string; name: string }>(`select id, name from placement_companies where tenant_id = $1 order by name`, [t]);
  if (!companies.length) return;
  const stages = ['recruiting', 'recruiting', 'engaged', 'recruiting', 'contacted', 'recruiting', 'dormant', 'engaged'];
  for (const [i, co] of companies.entries()) await k.q(`update placement_companies set crm_stage = $2, owner_user_id = $3 where id = $1`, [co.id, stages[i % stages.length], officer]);
  const contacts = await k.ins<{ id: string; companyId: string }>('placement_company_contacts', companies.map((co, i) => ({ companyId: co.id, name: [`Ms. ${FEMALE[i % FEMALE.length]} ${SURNAMES[i % SURNAMES.length]}`, `Mr. ${MALE[i % MALE.length]} ${SURNAMES[(i + 3) % SURNAMES.length]}`][i % 2], designation: ['Talent acquisition lead', 'Campus hiring manager', 'HR business partner'][i % 3], email: `campus@${co.name.toLowerCase().replace(/[^a-z]+/g, '')}.demo.zynetix.in`, phone: `+9198450${String(21000 + i)}`, isPrimary: true })));
  const talk: [string, string, string, string][] = [
    ['email', 'Shared the 2026-27 placement brochure and batch strength', 'Asked for the hiring plan', 'Follow up on the hiring plan'],
    ['call', 'Discussed roles and the eligibility for this year', 'Two roles likely, campus drive in January', 'Send the drive request form'],
    ['campus_visit', 'Pre-placement talk for the final year in the seminar hall', '180 students attended', 'Share the attendance list'],
    ['meeting', 'Met the regional HR head at their Whitefield office', 'Open to an internship drive as well', 'Propose internship dates'],
  ];
  await k.ins(
    'placement_interactions',
    companies.flatMap((co, i) =>
      talk.slice(0, 2 + (i % 3)).map(([kind, summary, outcome, next], n) => {
        const on = d(-60 + n * 18 + i);
        const last = n === 1 + (i % 3);
        // Three companies have a follow-up due (two of them overdue), two have one coming up.
        const follow = last ? (i < 3 ? d(-2 + i) : i < 5 ? d(5 + i) : null) : null;
        return { companyId: co.id, contactId: contacts.find((x) => x.companyId === co.id)?.id ?? null, kind, happenedOn: on > today ? today : on, summary, outcome, nextAction: last ? next : '', followUpOn: follow, followUpDone: !last, recordedBy: officer };
      }),
    ),
    { returning: false },
  );

  // ---- stricter drives and a women-only fellowship ------------------------------------------------
  await k.q(`update placement_drives set min_twelfth_pct = 60, max_gap_years = 1, require_verified_docs = true where tenant_id = $1 and title like 'Lalbagh Analytics:%'`, [t]);
  await k.q(`update placement_drives set min_tenth_pct = 55, max_backlog_history = 2 where tenant_id = $1 and title like 'Brightwave Technologies:%'`, [t]);
  const kaveri = companies.find((x) => x.name.startsWith('Kaveri')) ?? companies[0];
  const bcm = c.programs.BCM?.id;
  const bba = c.programs.BBA?.id;
  await k.ins('placement_drives', [{ companyId: kaveri.id, title: `${kaveri.name}: Women in Finance Fellowship`, kind: 'placement', category: 'dream', roleTitle: 'Graduate fellow, wealth management', ctcLpa: 7.5, location: 'Bengaluru (MG Road)', description: 'A one-year fellowship for women graduates in commerce and management, with a full-time role after it.', driveDate: d(18), registrationOpensOn: d(-2), registrationClosesOn: d(12), minCgpa: 6, maxBacklogs: 0, programIds: [bcm, bba].filter(Boolean), genders: ['female'], minTwelfthPct: 60, status: 'open', version: 1, notifiedAt: at(d(-2), '10:00'), createdBy: officer }], { returning: false });

  // ---- placement documents --------------------------------------------------------------------------
  const storage = o.files === false ? null : await service(ObjectStorage);
  const docRows = final.slice(0, Math.ceil(final.length * 0.7)).flatMap((s, i) => {
    const status = i % 9 === 4 ? 'pending' : i % 23 === 7 ? 'rejected' : 'verified';
    const rows = [{ studentId: s.id, kind: 'resume', title: `Resume ${s.rollNo}.pdf`, status, rejectReason: status === 'rejected' ? 'The resume has no contact number; add it and upload again' : null }];
    if (i % 3 === 0) rows.push({ studentId: s.id, kind: 'marks_12', title: `PUC marks card ${s.rollNo}.pdf`, status: i % 6 === 0 ? 'verified' : 'pending', rejectReason: null });
    return rows;
  });
  const docs = await k.ins<{ id: string; studentId: string; kind: string }>('placement_documents', docRows.map((x, i) => ({ ...x, storageKey: `tenants/${t}/placements/documents/${x.studentId}/seed-${i}-${x.kind}.pdf`, contentType: 'application/pdf', sizeBytes: PDF.length, reviewedBy: x.status === 'pending' ? null : officer, reviewedAt: x.status === 'pending' ? null : at(d(-3 - (i % 5))), uploadedBy: officer, createdAt: at(d(-6 - (i % 7))) })));
  if (storage) for (const x of docs) await storage.put(`tenants/${t}/placements/documents/${x.studentId}/seed-${docs.indexOf(x)}-${x.kind}.pdf`, bufferStream(PDF), 1024 * 1024, 'application/pdf');
  await k.ins('upload_scans', docs.map((x, i) => ({ subjectType: 'placement_document', subjectId: x.id, storageKey: `tenants/${t}/placements/documents/${x.studentId}/seed-${i}-${x.kind}.pdf`, status: 'clean', attempts: 1, scannedAt: at(d(-1)) })), { returning: false });
  // Registrations keep the resume on file.
  await k.q(`update drive_registrations r set resume_document_id = (select d.id from placement_documents d where d.student_id = r.student_id and d.kind = 'resume' and d.status <> 'rejected' limit 1) where r.tenant_id = $1`, [t]);

  // ---- training: aptitude bootcamp, SQL and Excel, mock interviews --------------------------------
  const trainers: [string, string, string | undefined, number, string][] = [
    ['Aptitude bootcamp (final year)', 'aptitude', undefined, 30, 'Talentsprint Bengaluru'],
    ['SQL and Excel for analysts', 'technical', c.programs.BCA?.id, 20, 'Department of Computer Applications'],
    ['Mock interviews and group discussions', 'mock_interview', undefined, 12, 'Alumni panel and the placement cell'],
  ];
  const progs = await k.ins<{ id: string; programId: string | null; kind: string; hours: number }>('placement_trainings', trainers.map(([title, kind, programId, hours, trainer], i) => ({ title, kind, programId: programId ?? null, batchYear: 2027, trainer, hours, startsOn: d(-50 + i * 10), endsOn: d(20 + i * 5), status: 'ongoing', description: ['Quant, logical reasoning and verbal ability, with weekly tests', 'Joins, grouping, pivots and dashboards', 'One mock interview and one GD per student'][i], createdBy: officer })));
  for (const [ti, tr] of progs.entries()) {
    const roster = final.filter((s) => !tr.programId || c.programs[s.prog]?.id === tr.programId);
    const sessions = await k.ins<{ id: string; hours: number }>('placement_training_sessions', Array.from({ length: [6, 4, 3][ti] }, (_, n) => ({ trainingId: tr.id, heldOn: d(-48 + ti * 10 + n * 6), topic: [['Percentages and ratios', 'Time and work', 'Number series', 'Syllogisms', 'Reading comprehension', 'Mock aptitude test'], ['SELECT and WHERE', 'Joins', 'GROUP BY and pivots', 'Dashboards in Excel'], ['Self-introduction and HR questions', 'Group discussion: UPI and cash', 'Technical mock interview']][ti][n], hours: [3, 4, 2][ti] })));
    await k.ins('placement_training_attendance', sessions.flatMap((se, n) => roster.map((s) => ({ sessionId: se.id, studentId: s.id, present: s.presence > 0.6 ? (n + s.rollNo.length) % 7 !== 0 : n % 2 === 0 }))), { returning: false });
    if (tr.kind === 'aptitude') await k.ins('placement_training_scores', roster.flatMap((s) => [['Aptitude test 1', d(-30)], ['Aptitude test 2', d(-8)]].map(([testName, takenOn], n) => ({ trainingId: tr.id, studentId: s.id, testName, score: Math.min(50, Math.round(18 + s.ability * 26 + n * 3)), maxScore: 50, takenOn }))), { returning: false });
  }

  // ---- internship hours and AICTE credits ------------------------------------------------------------
  await k.q(`update internships set hours = case status when 'completed' then 240 when 'ongoing' then 160 else null end, category = (array['industry', 'industry', 'research', 'rural', 'virtual'])[1 + (abs(hashtext(id::text)) % 5)], mode = case when abs(hashtext(id::text)) % 4 = 0 then 'hybrid' else 'onsite' end where tenant_id = $1`, [t]);
  await k.q(`update internships set credits = floor(hours / 45) where tenant_id = $1 and hours is not null and credits is null`, [t]);

  // ---- five outgoing batches (2022 to 2026) --------------------------------------------------------------
  const yearIds = new Map((await k.q<{ id: string; label: string }>(`select id, label from academic_years where tenant_id = $1`, [t])).map((y) => [y.label, y.id]));
  for (const y of [2022, 2023, 2024, 2025]) {
    const label = `${y - 1}-${String(y % 100).padStart(2, '0')}`;
    if (!yearIds.has(label)) yearIds.set(label, (await k.one<{ id: string }>('academic_years', { label, startsOn: `${y - 1}-08-01`, endsOn: `${y}-05-31`, isCurrent: false })).id);
  }
  const prevSections = await k.q<{ id: string; programId: string }>(`select s.id, s.program_id from sections s join academic_years a on a.id = s.academic_year_id join programs p on p.id = s.program_id where s.tenant_id = $1 and a.label = '2025-26' and s.term = p.term_count`, [t]);
  const outgoing: { id: string; prog: string; year: number; female: boolean; i: number }[] = [];
  let n = 0;
  for (const y of [2022, 2023, 2024, 2025, 2026]) {
    const label = `${y - 1}-${String(y % 100).padStart(2, '0')}`;
    for (const code of ['BCM', 'BBA', 'BCA'].filter((x) => c.programs[x])) {
      const p = c.programs[code];
      const have = y === 2026 ? prevSections.find((s) => s.programId === p.id) : undefined;
      // The 2025-26 BCom section and its graduates came with the convocation sample; the others are added here.
      if (have) {
        const grads = await k.q<{ id: string }>(`select id from students where section_id = $1 order by roll_no`, [have.id]);
        grads.forEach((g, i) => outgoing.push({ id: g.id, prog: code, year: y, female: i % 2 === 0, i: n++ }));
        continue;
      }
      const sec = await k.one<{ id: string }>('sections', { programId: p.id, academicYearId: yearIds.get(label), term: p.def.terms, name: 'A', displayName: `${p.def.name} Sem ${p.def.terms} A (${y - 3}-${String(y % 100).padStart(2, '0')} batch)` });
      const size = 9 + ((y + code.length) % 4);
      const grads = await k.ins<{ id: string }>('students', Array.from({ length: size }, (_, i) => {
        const female = (i + y) % 2 === 0;
        return { sectionId: sec.id, rollNo: `${String(y - 3).slice(2)}${code}${String(i + 1).padStart(3, '0')}`, fullName: `${(female ? FEMALE : MALE)[(i * 7 + y) % (female ? FEMALE : MALE).length]} ${SURNAMES[(i * 3 + y) % SURNAMES.length]}`, status: 'alumni', enrolledOn: `${y - 3}-08-01` };
      }));
      grads.forEach((g, i) => outgoing.push({ id: g.id, prog: code, year: y, female: (i + y) % 2 === 0, i: n++ }));
    }
  }
  await k.q(
    `insert into student_profiles (tenant_id, student_id, gender) select $1, x.id, x.g from unnest($2::uuid[], $3::text[]) as x(id, g) on conflict (student_id) do update set gender = coalesce(student_profiles.gender, excluded.gender)`,
    [t, outgoing.map((x) => x.id), outgoing.map((x) => (x.female ? 'female' : 'male'))],
  );
  // Each batch: about two in three placed through a campus drive; of the rest, higher studies, an exam, a venture.
  for (const y of [2022, 2023, 2024, 2025, 2026]) {
    for (const code of ['BCM', 'BBA', 'BCA'].filter((x) => c.programs[x])) {
      const batch = outgoing.filter((x) => x.year === y && x.prog === code);
      if (!batch.length) continue;
      const co = companies[(y + code.length) % companies.length];
      const drive = await k.one<{ id: string }>('placement_drives', { companyId: co.id, title: `${co.name}: ${c.programs[code].def.name} campus hiring ${y}`, kind: 'placement', category: 'regular', roleTitle: ['Associate', 'Management trainee', 'Software trainee'][['BCM', 'BBA', 'BCA'].indexOf(code)], ctcLpa: ctcOf(code, 0), location: 'Bengaluru', description: 'Campus hiring for the final year.', driveDate: `${y}-02-${String(10 + (code.length % 9)).padStart(2, '0')}`, registrationClosesOn: `${y}-02-05`, minCgpa: 5.5, maxBacklogs: 1, programIds: [c.programs[code].id], status: 'completed', version: 3, notifiedAt: at(`${y}-01-20`), createdBy: officer });
      const placed = batch.filter((x, i) => (i + y) % 3 !== 2);
      const regs = await k.ins<{ id: string; studentId: string }>('drive_registrations', batch.map((x) => ({ driveId: drive.id, studentId: x.id, status: placed.includes(x) ? 'selected' : 'rejected', cgpaAt: (6 + (x.i % 7) * 0.45).toFixed(2), backlogsAt: 0, createdAt: at(`${y}-02-01`) })));
      await k.ins('placement_offers', placed.map((x, i) => ({ driveId: drive.id, registrationId: regs.find((r) => r.studentId === x.id)!.id, studentId: x.id, roleTitle: 'Graduate trainee', ctcLpa: ctcOf(code, x.i), status: 'accepted', offeredOn: `${y}-02-20`, respondBy: `${y}-02-27`, respondedAt: at(`${y}-02-22`), respondedVia: i % 2 ? 'student' : 'office', joiningStatus: i % 6 === 5 ? 'not_joined' : 'joined', joinedOn: i % 6 === 5 ? null : `${y}-07-01` })), { returning: false });
      const rest = batch.filter((x) => !placed.includes(x));
      await k.ins('student_progressions', rest.flatMap((x, i) => {
        if (i % 4 === 3) return [{ studentId: x.id, kind: 'entrepreneurship', year: y, ventureName: `${SURNAMES[x.i % SURNAMES.length]} Traders`, ventureDetail: 'Family trading business taken online', verified: true }];
        const rows: Record<string, unknown>[] = [{ studentId: x.id, kind: 'higher_studies', year: y, institution: ['Christ University', 'IIM Bangalore', 'Bangalore University', 'Jain University', 'University of Leeds'][x.i % 5], program: code === 'BCA' ? 'MCA' : ['MBA', 'MCom', 'MBA', 'MCom', 'MSc Finance'][x.i % 5], country: x.i % 5 === 4 ? 'United Kingdom' : 'India', verified: i % 3 !== 2 }];
        // Some qualified an entrance or eligibility exam on the way.
        if (i % 2 === 0) rows.push({ studentId: x.id, kind: 'competitive_exam', year: y, exam: code === 'BCA' ? 'GATE' : ['CAT', 'KSET', 'GMAT'][x.i % 3], examRef: `${y}-${String(10000 + x.i)}`, verified: true });
        return rows;
      }), { returning: false });
    }
  }

  // ---- NATS apprenticeships for the 2026 graduates ------------------------------------------------------
  const recent = outgoing.filter((x) => x.year === 2026).slice(0, 4);
  const hoysala = companies.find((x) => x.name.startsWith('Hoysala')) ?? companies[0];
  const apps = await k.ins<{ id: string; stipendPaise: number; govtSharePaise: number; startsOn: string; status: string }>('apprenticeships', recent.map((x, i) => {
    const stipend = [1_400_000, 1_230_000, 1_500_000, 1_300_000][i];
    return { studentId: x.id, companyId: i < 2 ? hoysala.id : kaveri.id, establishment: i < 2 ? hoysala.name : kaveri.name, establishmentCode: i < 2 ? 'SKAMCC000123' : 'SKABLR004567', natsEnrolmentNo: `NKABLR${String(260001 + i)}`, contractNo: i === 3 ? '' : `KA/NATS/2026/${String(1100 + i)}`, category: 'graduate', role: ['Graduate apprentice, warehouse operations', 'Graduate apprentice, accounts', 'Graduate apprentice, customer service', 'Graduate apprentice, operations'][i], startsOn: '2026-07-01', endsOn: '2027-06-30', stipendPaise: stipend, govtSharePaise: natsGovtSharePaise('graduate', stipend, NATS_DEFAULTS), status: ['ongoing', 'ongoing', 'contract_registered', 'enrolled'][i], createdBy: officer };
  }));
  const paidMonths = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].filter((m) => m < today);
  await k.ins('apprenticeship_stipends', apps.filter((a) => a.status === 'ongoing').flatMap((a, i) => paidMonths.map((m, j) => ({ apprenticeshipId: a.id, month: m, employerPaidPaise: a.stipendPaise, dbtPaise: j === paidMonths.length - 1 && i === 1 ? 0 : a.govtSharePaise, dbtReference: j === paidMonths.length - 1 && i === 1 ? '' : `DBT/${m.slice(0, 7)}/${String(70 + i * 10 + j)}`, paidOn: addDays(m, 34), recordedBy: officer }))), { returning: false });

  // ---- alumni referrals --------------------------------------------------------------------------------
  const mentors = await k.q<{ id: string; employer: string }>(`select id, coalesce(employer, '') as employer from alumni_profiles where tenant_id = $1 and directory_visible and mentor_available and employer <> 'Own business' order by full_name limit 4`, [t]);
  if (mentors.length) {
    await k.ins('placement_referrals', final.filter((_, i) => i % 7 === 2).slice(0, 7).map((s, i) => {
      const m = mentors[i % mentors.length];
      return { studentId: s.id, alumniId: m.id, company: m.employer || 'Infosys', role: ['Analyst', 'Associate', 'Software engineer trainee', 'Operations executive'][i % 4], message: 'I am in my final year and would be grateful for a referral for the open role.', status: ['requested', 'referred', 'interviewing', 'hired', 'declined', 'requested', 'referred'][i], note: ['', 'Sent to the hiring manager', 'First round on Friday', 'Offer made', 'The role was filled', '', 'Shared with HR'][i], createdAt: at(d(-20 + i * 2)), updatedAt: at(d(-10 + i)) };
    }), { returning: false });
  }
}
