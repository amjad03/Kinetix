/** Sample records for the depth modules (migration 0118): exams, quality, HR and payroll, fees, assets, library, hostel, canteen, retention and mentoring follow-up. */
import { TEMPLATES, type TemplateCriterion } from '../../obe/quality.logic.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';

const monthOf = (day: string) => day.slice(0, 7);
const prevMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

export async function depthSamples(c: Ctx): Promise<void> {
  await examDepth(c);
  await qualityDepth(c);
  await hrDepth(c);
  await feeDepth(c);
  await assetDepth(c);
  await libraryDepth(c);
  await campusDepth(c);
  await mentoringDepth(c);
}

// ---- exams and the question bank -------------------------------------------------------------------------

async function examDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principal = c.byEmail.principal.id;
  const controller = c.byEmail.controller.id;

  // Results go through the approval route before they are published.
  await k.ins(
    'workflow_definitions',
    { requestType: 'result_publish', name: 'Result publication', description: 'The controller sends processed results to the principal before they reach students.', fields: J([]), steps: J([{ name: 'Principal approval', approver: { kind: 'role', role: 'principal' }, slaHours: 48 }]), active: true, createdBy: principal },
    { returning: false },
  );

  await k.ins('result_class_bands', { bands: J([{ name: 'Distinction', minPercent: 75 }, { name: 'First class', minPercent: 60 }, { name: 'Second class', minPercent: 50 }, { name: 'Pass class', minPercent: 40 }]), updatedBy: principal }, { returning: false });

  // A locked question paper waits, sealed, for the controller.
  const [paper] = await k.q<{ id: string }>("select id from qb_papers where status = 'locked' order by created_at desc limit 1");
  if (paper) await k.ins('qb_paper_releases', { paperId: paper.id, releaseAt: at(addDays(c.today, 2), '09:00'), controllerId: controller, status: 'scheduled', createdBy: principal }, { returning: false });

  // Practical and viva sittings of the latest exam session, with external examiners.
  const [session] = await k.q<{ id: string }>('select s.id from exam_sessions s where exists (select 1 from exam_papers p where p.session_id = s.id) order by s.starts_on desc limit 1');
  const papers = session ? await k.q<{ subjectId: string; sectionId: string }>('select subject_id, section_id from exam_papers where session_id = $1 order by exam_date limit 2', [session.id]) : [];
  for (const [i, p] of papers.entries()) {
    const mates = c.students.filter((s) => s.sectionId === p.sectionId).slice(0, 6);
    const examiner = c.teachers[i + 2]?.id ?? c.teachers[0].id;
    const [slot] = await k.ins<{ id: string }>('exam_practical_slots', {
      sessionId: session.id,
      subjectId: p.subjectId,
      kind: i === 0 ? 'practical' : 'viva',
      batchLabel: `Batch ${i + 1}`,
      roomId: c.rooms[i]?.id ?? null,
      slotDate: addDays(c.today, 12 + i),
      startsAt: i === 0 ? '10:00' : '14:00',
      endsAt: i === 0 ? '12:30' : '15:30',
      internalExaminerId: examiner,
      externalExaminerName: i === 0 ? 'Dr. Mallika Rao' : 'Prof. T. N. Murthy',
      externalExaminerOrg: i === 0 ? 'Mysore University' : 'Government First Grade College, Tumakuru',
      maxMarks: i === 0 ? 25 : 10,
      createdBy: controller,
    });
    await k.ins('exam_practical_candidates', mates.map((s) => ({ slotId: slot.id, studentId: s.id })), { returning: false });
  }

  // A class test whose marks were scaled up after the paper proved harder than planned (the originals are kept).
  const section = c.sections[0];
  const subject = section.subjects[0];
  const teacher = c.teachers.find((t) => t.id === subject.teacherId)?.id ?? c.teachers[0].id;
  const [test] = await k.ins<{ id: string }>('assessments', { sectionId: section.id, subjectId: subject.id, title: 'Unit test 2 (scaled after review)', kind: 'internal', maxMarks: 20, heldOn: addDays(c.today, -9), markStatus: 'moderated', createdBy: teacher, moderatedBy: controller, moderatedAt: new Date() });
  const before: { studentId: string; moderated: number | null }[] = [];
  const mates = section.students.slice(0, 10);
  for (const [i, s] of mates.entries()) {
    const marks = 6 + ((i * 7) % 13);
    const scaled = Math.min(20, Math.round(marks * 1.15 * 100) / 100);
    await k.ins('marks', { assessmentId: test.id, studentId: s.id, marks, moderatedMarks: scaled === marks ? null : scaled, moderationNote: scaled === marks ? null : 'Normalised (scale 1.15): paper was harder than planned' }, { returning: false });
    if (scaled !== marks) before.push({ studentId: s.id, moderated: null });
  }
  await k.ins('mark_normalisations', { assessmentId: test.id, method: 'scale', value: 1.15, affected: before.length, before: J(before), reason: 'Paper was harder than planned', appliedBy: controller }, { returning: false });
}

// ---- quality: criteria tree, evidence, CQI loop -------------------------------------------------------------

async function qualityDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const iqac = c.byEmail.iqac.id;
  const [fw] = await k.ins<{ id: string }>('accreditation_frameworks', { body: 'naac', name: 'NAAC assessment 2026-27 (starter)', version: '2026-27', status: 'active', createdBy: iqac });
  let sort = 0;
  const made: { id: string; code: string; harvestSource: string; target: number | null; unit: string }[] = [];
  const add = async (items: TemplateCriterion[], parentId: string | null) => {
    for (const x of items) {
      const [row] = await k.ins<{ id: string }>('accreditation_criteria', { frameworkId: fw.id, parentId, code: x.code, title: x.title, metric: x.metric ?? '', unit: x.unit ?? '', target: x.target ?? null, weight: x.weight ?? 1, ownerId: iqac, harvestSource: x.harvestSource ?? '', sort: sort++ });
      made.push({ id: row.id, code: x.code, harvestSource: x.harvestSource ?? '', target: x.target ?? null, unit: x.unit ?? '' });
      if (x.children) await add(x.children, row.id);
    }
  };
  await add(TEMPLATES.naac.criteria, null);

  // Figures the evidence engine collects from the other modules, as dated evidence lines.
  const sources: Record<string, string> = {
    students: "select count(*)::int as v from students where status in ('enrolled', 'active')",
    staff: "select count(*)::int as v from staff_profiles where status = 'active'",
    publications: 'select count(*)::int as v from publications',
    lms_items: 'select count(*)::int as v from lms_items',
    committee_meetings: 'select count(*)::int as v from committee_meetings',
    course_files: 'select count(*)::int as v from course_files where reviewed_at is not null',
  };
  for (const m of made.filter((x) => x.harvestSource in sources)) {
    const [r] = await k.q<{ v: number }>(sources[m.harvestSource]);
    await k.q('update accreditation_criteria set actual = $2 where id = $1', [m.id, r.v]);
    await k.ins('obe_evidence', { scope: 'criterion', targetId: m.id, title: `${m.harvestSource.replace(/_/g, ' ')}: ${r.v}${m.unit ? ' ' + m.unit : ''}`, note: `Collected automatically on ${c.today}.`, uploadedBy: iqac, source: m.harvestSource, sourceRef: m.id }, { returning: false });
  }
  const best = made.find((x) => x.code === '7.1');
  if (best) {
    await k.q('update accreditation_criteria set actual = 1 where id = $1', [best.id]);
    await k.ins('obe_evidence', { scope: 'criterion', targetId: best.id, title: 'Best practice: peer-assisted learning in the first semester', url: 'https://example.org/soundarya/best-practices/peer-learning', note: 'Documented by the IQAC cell.', uploadedBy: iqac }, { returning: false });
  }

  // The CQI loop on the improvement actions already in the system: why, from what to what, and the re-measurement.
  const actions = await k.q<{ id: string }>('select id from improvement_actions order by created_at limit 4');
  const rca = [
    { rootCause: 'Students enter with little ledger practice; practical hours are short.', baseline: 52, target: 65, on: addDays(c.today, 40), after: null as number | null },
    { rootCause: 'Question papers over-weight recall; application questions are rare.', baseline: 48, target: 60, on: addDays(c.today, -10), after: null },
    { rootCause: 'Weak attendance in the first hour of Saturday classes.', baseline: 58, target: 70, on: addDays(c.today, -30), after: 72 },
    { rootCause: 'Library hours do not match the timetable of evening students.', baseline: 40, target: 55, on: addDays(c.today, -45), after: 47 },
  ];
  for (const [i, a] of actions.entries()) {
    const r = rca[i];
    await k.q('update improvement_actions set root_cause = $2, baseline_value = $3, target_value = $4, remeasure_on = $5, remeasured_value = $6, remeasure_note = $7, remeasured_at = $8 where id = $1', [a.id, r.rootCause, r.baseline, r.target, r.on, r.after, r.after === null ? null : r.after >= r.target ? 'Target met after the extra practical hours.' : 'Better, but short of the target; a second cycle is planned.', r.after === null ? null : new Date()]);
  }

  // Questions of one scanned exam paper tagged with course outcomes.
  const [paper] = await k.q<{ id: string; subjectId: string }>('select p.id, p.subject_id from exam_papers p join eval_questions q on q.paper_id = p.id group by p.id limit 1');
  if (paper) {
    const cos = await k.q<{ id: string }>('select co.id from course_outcomes co join co_sets cs on cs.id = co.co_set_id where cs.subject_id = $1 order by co.ord limit 3', [paper.subjectId]);
    const qs = await k.q<{ id: string }>('select id from eval_questions where paper_id = $1 order by ord', [paper.id]);
    for (const [i, q] of qs.entries()) if (cos.length) await k.q('update eval_questions set co_id = $2 where id = $1', [q.id, cos[i % cos.length].id]);
  }
}

// ---- HR and payroll -----------------------------------------------------------------------------------------

async function hrDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const hr = c.byEmail.hr.id;
  const principal = c.byEmail.principal.id;
  const teachers = c.teachers.slice(0, 18);

  const degrees = [['M.Com', 'Bangalore University', 2011, 'Postgraduate'], ['MBA', 'Bengaluru City University', 2013, 'Postgraduate'], ['M.Sc (Computer Science)', 'Mysore University', 2012, 'Postgraduate'], ['PhD', 'Visvesvaraya Technological University', 2019, 'Doctorate']] as const;
  const skills = ['Tally Prime', 'Python', 'Business analytics', 'Financial modelling', 'Aviation safety', 'Research methods'];
  const rows = teachers.flatMap((t, i) => {
    const d = degrees[i % degrees.length];
    return [
      { userId: t.id, kind: 'degree', title: d[0], institution: d[1], year: d[2], level: d[3], verifiedBy: hr, verifiedAt: new Date() },
      { userId: t.id, kind: 'skill', title: skills[i % skills.length], institution: '', level: i % 3 === 0 ? 'Expert' : 'Working', verifiedBy: i % 2 === 0 ? hr : null, verifiedAt: i % 2 === 0 ? new Date() : null },
      ...(i % 4 === 0 ? [{ userId: t.id, kind: 'certification', title: 'NPTEL certified: Teaching and learning in higher education', institution: 'NPTEL', year: 2024, level: 'Elite', verifiedBy: hr, verifiedAt: new Date() }] : []),
    ];
  });
  await k.ins('staff_qualifications', rows, { returning: false });

  // Teaching evaluation for the current year: students, the head of department, a peer and the teacher.
  const [year] = await k.q<{ id: string }>('select id from academic_years where is_current limit 1');
  const criteria = ['clarity', 'preparation', 'punctuality', 'engagement', 'fairness', 'support'];
  const withLogin = c.students.filter((s) => s.userId);
  const evals: Record<string, unknown>[] = [];
  for (const [i, t] of teachers.slice(0, 8).entries()) {
    const base = 3 + ((i * 3) % 3) * 0.5;
    const score = (bias: number) => Object.fromEntries(criteria.map((cr, j) => [cr, Math.max(1, Math.min(5, Math.round(base + bias + ((j + i) % 3 === 0 ? 0.5 : 0)))) ]));
    const avg = (sc: Record<string, number>) => Math.round((Object.values(sc).reduce((a, b) => a + b, 0) / criteria.length) * 100) / 100;
    const add = (raterKind: string, raterUserId: string, sc: Record<string, number>, comment = '') => evals.push({ staffUserId: t.id, academicYearId: year.id, raterKind, raterUserId, scores: J(sc), average: avg(sc), comment });
    for (const s of withLogin.slice(0, 2)) add('student', s.userId!, score(0.5), i % 2 === 0 ? 'Explains with good examples.' : '');
    add('hod', c.byEmail['hod.commerce'].id === t.id ? c.byEmail['hod.management'].id : c.byEmail['hod.commerce'].id, score(0), 'Plans lessons well; submits course file on time.');
    add('peer', teachers[(i + 1) % teachers.length].id, score(-0.5));
    add('self', t.id, score(0.5));
  }
  await k.ins('teaching_evaluations', evals, { returning: false });

  // Overtime and arrears for the current month (one approved, one waiting), a recovery, and the year's tax deposits.
  const month = monthOf(c.today);
  const [a, b, d] = teachers;
  await k.ins(
    'payroll_adjustments',
    [
      { userId: a.id, kind: 'overtime', payMonth: month, hours: 12, ratePaise: rupees(480), amountPaise: rupees(480) * 12, reason: 'Valuation duty after hours', status: 'approved', createdBy: hr, decidedBy: principal, decidedAt: new Date() },
      { userId: b.id, kind: 'arrear', payMonth: month, hours: null, ratePaise: rupees(3000), amountPaise: rupees(9000), reason: 'Revision arrears: 3 month(s) from the revised scale', status: 'pending', createdBy: hr },
      { userId: d.id, kind: 'recovery', payMonth: month, hours: null, amountPaise: rupees(2000), reason: 'Festival advance recovery', status: 'approved', createdBy: hr, decidedBy: principal, decidedAt: new Date() },
    ],
    { returning: false },
  );
  await k.ins('payroll_tax_profile', { tan: 'BLRS12345C', pan: 'AAATS1234F', deductorName: 'Soundarya Institute of Management and Science', deductorAddress: 'Soundarya Nagar, Sidedahalli, Nagasandra Post, Bengaluru 560073', responsiblePerson: 'Dr. Savitha Hegde', responsibleDesignation: 'Principal' }, { returning: false });
  const tds = await k.q<{ month: string; tds: string }>("select r.month, sum(p.tds_paise)::text as tds from payslips p join payroll_runs r on r.id = p.run_id where r.status = 'locked' group by r.month order by r.month");
  const fy = (m: string) => {
    const y = Number(m.slice(0, 4));
    const s = Number(m.slice(5, 7)) >= 4 ? y : y - 1;
    return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
  };
  const challans = tds.filter((r) => Number(r.tds) > 0).map((r, i) => ({ financialYear: fy(r.month), payMonth: r.month, section: '192', bsrCode: '0510308', challanSerial: String(10000 + i), depositedOn: `${prevMonth(r.month, -1)}-07`, tdsPaise: Number(r.tds), createdBy: hr }));
  if (challans.length > 1) await k.ins('tds_challans', challans.slice(0, -1), { returning: false }); // the latest month's deposit is still due
}

// ---- fees ---------------------------------------------------------------------------------------------------------

async function feeDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const acct = c.byEmail.accounts.id;
  const plans = await k.ins<{ id: string }>('fee_instalment_plans', [
    { name: 'Two instalments (60/40)', parts: J([{ percent: 60, dueAfterDays: 0 }, { percent: 40, dueAfterDays: 45 }]) },
    { name: 'Three instalments (50/30/20)', parts: J([{ percent: 50, dueAfterDays: 0 }, { percent: 30, dueAfterDays: 30 }, { percent: 20, dueAfterDays: 60 }]) },
    { name: 'Monthly for four months', parts: J([{ percent: 25, dueAfterDays: 0 }, { percent: 25, dueAfterDays: 30 }, { percent: 25, dueAfterDays: 60 }, { percent: 25, dueAfterDays: 90 }]) },
  ]);
  const [rule] = await k.ins<{ id: string }>('fee_late_fee_rules', { name: 'Late fee: Rs 50 after 5 days, Rs 10 a day, up to Rs 500', graceDays: 5, flatPaise: rupees(50), perDayPaise: rupees(10), capPaise: rupees(500) });

  // Three unpaid invoices of the next dues split into instalments.
  const open = await k.q<{ id: string; amountPaise: string; dueOn: string }>("select id, amount_paise, due_on from fee_invoices where status = 'due' and paid_paise = 0 and due_on >= $1 order by due_on, id limit 3", [c.today]);
  for (const [i, inv] of open.entries()) {
    const parts = (i === 0 ? [{ percent: 60, dueAfterDays: 0 }, { percent: 40, dueAfterDays: 45 }] : [{ percent: 50, dueAfterDays: 0 }, { percent: 30, dueAfterDays: 30 }, { percent: 20, dueAfterDays: 60 }]);
    let given = 0;
    const rows = parts.map((p, j) => {
      const amount = j === parts.length - 1 ? Number(inv.amountPaise) - given : Math.round((Number(inv.amountPaise) * p.percent) / 100);
      given += amount;
      return { invoiceId: inv.id, planId: plans[i === 0 ? 0 : 1].id, seq: j + 1, dueOn: addDays(inv.dueOn, p.dueAfterDays), amountPaise: amount };
    });
    await k.ins('fee_instalments', rows, { returning: false });
  }

  // Overdue invoices already carry their fine.
  const overdue = await k.q<{ id: string; dueOn: string }>("select id, due_on from fee_invoices where status = 'due' and due_on < $1 order by due_on limit 6", [c.today]);
  for (const inv of overdue) {
    const days = Math.round((Date.parse(`${c.today}T00:00:00Z`) - Date.parse(`${inv.dueOn}T00:00:00Z`)) / 86_400_000);
    const late = Math.max(0, days - 5);
    if (late === 0) continue;
    const fine = Math.min(rupees(500), rupees(50) + rupees(10) * late);
    await k.ins('fee_late_fees', { invoiceId: inv.id, ruleId: rule.id, daysLate: late, appliedPaise: fine, lastRunOn: c.today }, { returning: false });
    await k.q('update fee_invoices set amount_paise = amount_paise + $2 where id = $1', [inv.id, fine]);
  }

  // Advance credit held for a few families.
  const some = c.students.slice(0, 40).filter((_, i) => i % 7 === 0);
  await k.ins('student_credits', some.map((s, i) => ({ studentId: s.id, amountPaise: rupees(2000 * (i + 1)), kind: 'advance', note: 'Advance paid at admission', createdBy: acct })), { returning: false });
  if (some[0]) await k.ins('student_credits', { studentId: some[0].id, amountPaise: -rupees(1000), kind: 'refund', note: 'Part refund on request', createdBy: acct }, { returning: false });
}

// ---- assets -------------------------------------------------------------------------------------------------------

async function assetDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const keeper = c.byEmail.stores.id;
  const list = await k.q<{ id: string; name: string; purchasedOn: string }>('select id, name, purchased_on from assets order by tag limit 8');
  for (const [i, a] of list.entries()) {
    await k.q('update assets set serial_no = $2, warranty_until = $3 where id = $1', [a.id, `SN-${String(7000 + i)}`, addDays(c.today, [-20, 25, 90, 200, 340, 45, 400, -90][i])]);
  }
  const vendors = await k.q<{ id: string; name: string }>('select id, name from inv_vendors order by name limit 3');
  await k.ins(
    'amc_contracts',
    list.slice(0, 4).map((a, i) => ({ title: `${a.name}: annual maintenance`, assetId: a.id, vendorId: vendors[i % Math.max(1, vendors.length)]?.id ?? null, vendorName: vendors[i % Math.max(1, vendors.length)]?.name ?? 'Service vendor', covers: i % 2 === 0 ? 'Parts and labour, two visits a year' : 'Labour only', startsOn: addDays(c.today, -180 + i * 20), endsOn: addDays(c.today, [185, 40, -5, 300][i]), costPaise: rupees(6000 + i * 2500), visitsPerYear: 2 + (i % 2) * 2, visitsDone: i === 0 ? 1 : 0, contact: '080 4000 12' + (30 + i), status: i === 2 ? 'cancelled' : 'active', createdBy: keeper })),
    { returning: false },
  );
  // Each smartboard of the fleet sits in the asset register against its room.
  const boards = await k.q<{ id: string; name: string; roomId: string | null }>('select id, name, room_id from devices order by name limit 6');
  await k.ins(
    'assets',
    boards.map((b, i) => ({ tag: `AST-SB-${String(i + 1).padStart(4, '0')}`, name: b.name, category: 'smartboard', location: '', purchasedOn: addDays(c.today, -400 - i * 15), costPaise: rupees(120000), salvagePaise: rupees(12000), usefulLifeYears: 6, deviceId: b.id, roomId: b.roomId, warrantyUntil: addDays(c.today, 700 - i * 30), serialNo: `SB-${5000 + i}` })),
    { returning: false },
  );
}

// ---- library ---------------------------------------------------------------------------------------------------

async function libraryDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const lib = c.byEmail.library.id;
  const books = await k.q<{ id: string; title: string }>('select id, title from library_books order by created_at, id');
  for (const [i, b] of books.entries()) await k.q('update library_books set barcode = $2, price_paise = $3 where id = $1', [b.id, `LB${String(i + 1).padStart(6, '0')}`, rupees(250 + (i % 7) * 60)]);

  // Renewals, a reservation queue, one lost and one damaged book.
  const loans = await k.q<{ id: string; bookId: string; studentId: string; dueOn: string }>('select id, book_id, student_id, due_on from library_loans where returned_at is null order by due_on limit 6');
  for (const [i, l] of loans.entries()) if (i % 2 === 0) await k.q('update library_loans set renew_count = 1, due_on = $2 where id = $1', [l.id, addDays(l.dueOn, 14)]);
  const held = loans.slice(0, 2);
  const waiting = c.students.slice(60, 64);
  for (const [i, l] of held.entries()) {
    await k.ins('library_reservations', [{ bookId: l.bookId, studentId: waiting[i * 2].id, status: 'waiting' }, { bookId: l.bookId, studentId: waiting[i * 2 + 1].id, status: 'waiting' }], { returning: false });
  }
  const returned = await k.q<{ id: string }>('select id from library_loans where returned_at is not null order by returned_at desc limit 2');
  if (returned[0]) await k.q("update library_loans set condition = 'lost', condition_note = 'Lost on the college bus', fine_paise = fine_paise + 25000 where id = $1", [returned[0].id]);
  if (returned[1]) await k.q("update library_loans set condition = 'damaged', condition_note = 'Water damage on 14 pages', fine_paise = fine_paise + 8000 where id = $1", [returned[1].id]);

  // The e-resource register with a few weeks of use.
  const er = await k.ins<{ id: string }>('library_eresources', [
    { title: 'Indian Journal of Accounting', kind: 'journal', publisher: 'Indian Accounting Association', url: 'https://example.org/ija', licenceUntil: addDays(c.today, 200), seats: 10, createdBy: lib },
    { title: 'Business Source Complete', kind: 'database', publisher: 'EBSCO', url: 'https://example.org/bsc', licenceUntil: addDays(c.today, 25), seats: 5, createdBy: lib },
    { title: 'NPTEL: Financial Accounting', kind: 'video', publisher: 'NPTEL', url: 'https://nptel.ac.in/courses/110101131', createdBy: lib },
    { title: 'Principles of Management (e-book)', kind: 'ebook', publisher: 'Open Textbook Library', url: 'https://example.org/pom', licenceUntil: addDays(c.today, -12), createdBy: lib },
  ]);
  const readers = c.students.filter((s) => s.userId).slice(0, 8).map((s) => s.userId!);
  const access = er.slice(0, 3).flatMap((r, i) => readers.slice(0, 4 + i * 2).map((u, j) => ({ resourceId: r.id, userId: u, accessedAt: at(addDays(c.today, -((i + j) % 20)), `1${j % 6}:15`) })));
  await k.ins('library_eresource_access', access, { returning: false });

  // Topics the library recommends material for.
  const topics = await k.q<{ id: string }>('select id from topics order by id limit 3');
  const links = topics.flatMap((t, i) => [
    ...(books[i] ? [{ topicId: t.id, resourceKind: 'book', resourceId: books[i].id, createdBy: lib }] : []),
    { topicId: t.id, resourceKind: 'eresource', resourceId: er[i % er.length].id, createdBy: lib },
  ]);
  await k.ins('resource_topic_links', links, { returning: false });
}

// ---- hostel, canteen, retention --------------------------------------------------------------------------------

async function campusDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const warden = c.byEmail.warden.id;
  const canteen = c.byEmail.canteen.id;

  const complaints = await k.q<{ id: string; roomId: string | null; category: string; description: string }>('select id, room_id, category, description from hostel_complaints order by created_at limit 6');
  const states = ['open', 'assigned', 'in_progress', 'done', 'verified', 'reopened'];
  for (const [i, cmp] of complaints.entries()) {
    const status = states[i % states.length];
    await k.ins(
      'hostel_work_orders',
      { complaintId: cmp.id, roomId: cmp.roomId, title: cmp.description.slice(0, 80) || 'Repair', category: cmp.category, priority: i % 3 === 0 ? 'high' : 'normal', assigneeName: status === 'open' ? '' : ['Raju (plumber)', 'Manjula (electrician)', 'Basavaraj (carpenter)'][i % 3], status, dueOn: addDays(c.today, 3 - i), costPaise: ['done', 'verified'].includes(status) ? rupees(450 + i * 120) : 0, completedAt: ['done', 'verified'].includes(status) ? new Date() : null, verifiedBy: status === 'verified' ? warden : null, verifiedAt: status === 'verified' ? new Date() : null, createdBy: warden },
      { returning: false },
    );
  }

  // Two weeks of kitchen stock: purchases from vendors, use at meals, and wastage.
  const vendors = await k.q<{ id: string }>('select id from inv_vendors order by name limit 2');
  const items: [string, string, number, number][] = [['Rice', 'kg', 40, 5200], ['Toor dal', 'kg', 12, 14000], ['Cooking oil', 'l', 10, 13500], ['Vegetables', 'kg', 35, 4000], ['Milk', 'l', 60, 5200], ['Wheat flour', 'kg', 25, 4200]];
  const log: Record<string, unknown>[] = [];
  const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
  for (let d = 14; d >= 1; d--) {
    const day = addDays(c.today, -d);
    for (const [i, [name, unit, daily, price]] of items.entries()) {
      if (d % 4 === 0) log.push({ kind: 'purchase', loggedOn: day, itemName: name, vendorId: vendors[i % Math.max(1, vendors.length)]?.id ?? null, quantity: daily * 4, unit, costPaise: daily * 4 * price, recordedBy: canteen });
      const used = Math.round(daily * (0.9 + ((d * (i + 3)) % 5) / 20) * 100) / 100;
      log.push({ kind: 'use', loggedOn: day, meal: meals[i % 4], itemName: name, quantity: used, unit, recordedBy: canteen });
      if ((d + i) % 3 === 0) log.push({ kind: 'waste', loggedOn: day, meal: meals[(i + 1) % 4], itemName: name, quantity: Math.round(daily * 0.06 * 100) / 100, unit, reason: 'Left on plates', recordedBy: canteen });
    }
  }
  await k.ins('canteen_stock_log', log, { returning: false });

  const raters = c.students.filter((s) => s.userId).slice(0, 12);
  const fb: Record<string, unknown>[] = [];
  for (let d = 6; d >= 1; d--) for (const [i, s] of raters.entries()) if ((i + d) % 2 === 0) fb.push({ userId: s.userId, studentId: s.id, mealDate: addDays(c.today, -d), meal: meals[(i + d) % 4], rating: 2 + ((i * d) % 4), comment: (i + d) % 5 === 0 ? 'Needs less oil.' : '' });
  await k.ins('canteen_feedback', fb, { returning: false });

  // Health and counselling records are kept for three years, then stripped.
  await k.ins('retention_rules', [{ dataClass: 'health_visits', retainMonths: 36, action: 'delete', active: true, updatedBy: c.byEmail.principal.id }, { dataClass: 'counselling', retainMonths: 36, action: 'redact', active: true, updatedBy: c.byEmail.principal.id }], { returning: false });
}

// ---- mentoring -----------------------------------------------------------------------------------------------------------

async function mentoringDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const plans = await k.q<{ id: string; studentId: string; mentorUserId: string; reviewOn: string; status: string }>('select id, student_id, mentor_user_id, review_on, status from intervention_plans order by created_at limit 6');
  const kinds: [string, string][] = [['tutoring', 'Peer tutoring on Fridays'], ['remedial_class', 'Remedial class for ledger posting'], ['content', 'Revise the chapter on final accounts'], ['counselling', 'Study-skills session with the counsellor']];
  for (const [i, p] of plans.entries()) {
    const [kind, title] = kinds[i % kinds.length];
    await k.ins('intervention_support', [{ planId: p.id, kind, title, dueOn: addDays(c.today, 7 - i), done: i % 3 === 0, createdBy: p.mentorUserId }, { planId: p.id, kind: 'content', title: 'Weekly practice set', ref: 'practice:weekly', dueOn: addDays(c.today, 14), done: false, createdBy: p.mentorUserId }], { returning: false });
    const closed = p.status === 'closed';
    await k.ins('intervention_reassessments', { planId: p.id, studentId: p.studentId, scoreBefore: 3 + (i % 3), signalsBefore: J([{ kind: 'attendance', value: 62 }, { kind: 'marks', value: 1 }]), scoreAfter: closed ? 1 + (i % 2) : null, signalsAfter: closed ? J([{ kind: 'marks', value: 1 }]) : null, dueOn: p.reviewOn, assessedAt: closed ? new Date() : null, outcome: closed ? 'improved' : null }, { returning: false });
  }
}
