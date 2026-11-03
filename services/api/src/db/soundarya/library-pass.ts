/**
 * The library pass on the demo college: branches, member categories and a card for every student and teacher, the
 * accession register (a copy per book copy, with barcodes, RFID tags, shelves and five financial years of purchases),
 * loans tied to their copies and cards, the circulation rules matrix, the gate register (this year and last), overdue
 * notices, a pending fine waiver, vendors, department budget heads, suggestions through purchase orders to a passed
 * invoice, journals with missing and claimed issues, DELNET, N-LIST and e-ShodhSindhu with their cost and monthly
 * usage, a binding batch at the binder and one back, an inter-library loan and the institutional repository.
 */
import type { Ctx } from './ctx.js';
import { addDays, at, rupees, weekday } from './kit.js';

/** The financial year (April to March) a day falls in, as 2026-27. */
const fyOf = (d: string) => {
  const y = Number(d.slice(0, 4));
  const start = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
  return { start, label: `${start}-${String((start + 1) % 100).padStart(2, '0')}` };
};
const pad = (n: number) => String(n).padStart(4, '0');

export async function libraryPass(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const lib = c.byEmail.library.id;
  const principal = c.byEmail.principal.id;
  const fy = fyOf(c.today);
  const tid = c.tenantId;

  // ---- branches and member categories -------------------------------------------------------------------------------
  const [main, annex] = await k.ins<{ id: string }>('library_branches', [
    { name: 'Central Library', code: 'CL', isMain: true, sortOrder: 1 },
    { name: 'Computer Science Reading Room', code: 'CS', sortOrder: 2 },
  ]);
  const cats = await k.ins<{ id: string; name: string }>('library_member_categories', [
    { name: 'UG students', kind: 'student', loanDays: 14, maxBooks: 4, finePaisePerDay: 200, maxRenewals: 2, sortOrder: 1 },
    { name: 'PG students', kind: 'student', loanDays: 21, maxBooks: 6, finePaisePerDay: 200, maxRenewals: 2, sortOrder: 2 },
    { name: 'Book bank (SC/ST)', kind: 'book_bank', loanDays: 150, maxBooks: 4, finePaisePerDay: 0, maxRenewals: 0, sortOrder: 3 },
    { name: 'Teaching staff', kind: 'staff', loanDays: 60, maxBooks: 10, finePaisePerDay: 100, maxRenewals: 3, sortOrder: 4 },
    { name: 'Non-teaching staff', kind: 'staff', loanDays: 30, maxBooks: 4, finePaisePerDay: 100, maxRenewals: 2, sortOrder: 5 },
    { name: 'Alumni and researchers', kind: 'external', loanDays: 14, maxBooks: 2, finePaisePerDay: 500, maxRenewals: 1, depositPaise: rupees(2000), sortOrder: 6 },
  ]);
  const cat = (name: string) => cats.find((x) => x.name === name)!.id;

  // The circulation rules matrix: what differs from a category's own rule for a kind of material.
  await k.ins('library_circ_rules', [
    { categoryId: cat('UG students'), material: 'book', loanDays: 14, maxItems: 4, finePaisePerDay: 200, graceDays: 1, maxFinePaise: rupees(150), maxRenewals: 2, note: 'Text and general books', sortOrder: 1 },
    { categoryId: cat('UG students'), material: 'reference', loanDays: 0, maxItems: 0, finePaisePerDay: 0, maxRenewals: 0, canReserve: false, note: 'Read in the reference section only', sortOrder: 2 },
    { categoryId: cat('PG students'), material: 'thesis', loanDays: 3, maxItems: 1, finePaisePerDay: 1000, maxFinePaise: rupees(300), maxRenewals: 0, note: 'Overnight-style loan of a dissertation', sortOrder: 3 },
    { categoryId: cat('Teaching staff'), material: 'book', loanDays: 90, maxItems: 10, finePaisePerDay: 0, maxRenewals: 3, note: 'A semester for teaching staff, no fine', sortOrder: 4 },
    { categoryId: cat('Teaching staff'), material: 'reference', loanDays: 3, maxItems: 2, finePaisePerDay: 500, maxRenewals: 1, note: 'Overnight reference for lecture preparation', sortOrder: 5 },
    { material: 'cd', loanDays: 7, maxItems: 1, finePaisePerDay: 500, maxFinePaise: rupees(200), maxRenewals: 0, note: 'CDs and DVDs with books', sortOrder: 6 },
  ], { returning: false });

  // ---- cards: every student (UG, PG and the book bank scheme) and every teacher ------------------------------------
  const pgProgs = new Set(Object.entries(c.programs).filter(([, p]) => p.def.level === 'pg').map(([code]) => code));
  const students = c.students;
  const cards = await k.ins<{ id: string; studentId: string | null; userId: string | null; cardNo: string }>('library_members', [
    ...students.map((s, i) => ({ cardNo: `MEM-${pad(i + 1)}`, kind: 'student', studentId: s.id, userId: s.userId ?? null, fullName: s.name, categoryId: i % 23 === 5 ? cat('Book bank (SC/ST)') : pgProgs.has(s.prog) ? cat('PG students') : cat('UG students'), validUntil: `${fy.start + 1}-06-30` })),
    ...c.teachers.map((t, i) => ({ cardNo: `MEM-${pad(students.length + i + 1)}`, kind: 'staff', userId: t.id, fullName: t.name, email: t.email, categoryId: cat('Teaching staff'), validUntil: `${fy.start + 3}-03-31` })),
    { cardNo: `MEM-${pad(students.length + c.teachers.length + 1)}`, kind: 'external', fullName: 'Dr. Raghavendra Iyer', organisation: 'Alumni association (BCom 2009)', phone: '+919845012345', categoryId: cat('Alumni and researchers'), depositPaise: rupees(2000), depositPaidOn: addDays(c.today, -60), depositReceipt: 'LIB-DEP-118', validUntil: addDays(c.today, 305) },
  ]);
  const memberOf = new Map(cards.filter((m) => m.studentId).map((m) => [m.studentId!, m]));
  const staffCards = cards.filter((m) => !m.studentId && m.userId);
  const lastCard = students.length + c.teachers.length + 1;

  // ---- the accession register --------------------------------------------------------------------------------------
  const books = await k.q<{ id: string; title: string; author: string; copies: number; callNo: string | null; pricePaise: number }>('select id, title, author, copies, call_no, price_paise from library_books order by created_at, id');
  const fyStarts = [fy.start - 4, fy.start - 3, fy.start - 2, fy.start - 1, fy.start];
  const copies: Record<string, unknown>[] = [];
  let acc = 0;
  for (const [bi, b] of books.entries()) {
    const ddc = (b.callNo ?? '').split(' ')[0];
    const material = bi % 15 === 13 ? 'reference' : 'book';
    await k.q('update library_books set class_scheme = $2, class_number = $3, ddc = coalesce(nullif(ddc, \'\'), $3), material = $4, publisher = coalesce(nullif(publisher, \'\'), $5), pub_year = coalesce(pub_year, $6), language = coalesce(nullif(language, \'\'), $7), subject = coalesce(nullif(subject, \'\'), $8) where id = $1', [
      b.id, 'ddc', ddc, material, ['Pearson', 'McGraw Hill Education', 'S. Chand', 'Sultan Chand and Sons', 'Himalaya Publishing House', 'Vikas Publishing'][bi % 6], 2008 + (bi % 17), /^K891/.test(ddc) ? 'Kannada' : 'English',
      /^657/.test(ddc) ? 'Accounting' : /^65/.test(ddc) ? 'Management' : /^00/.test(ddc) ? 'Computer science' : /^38/.test(ddc) ? 'Aviation' : /^34/.test(ddc) ? 'Law and taxation' : /^33/.test(ddc) ? 'Banking and finance' : 'General',
    ]);
    for (let j = 0; j < b.copies; j++) {
      acc++;
      // Older titles came first; a few copies are from five years ago and never went out (weeding candidates).
      const year = fyStarts[Math.min(4, Math.floor((bi + j * 7) % 5))];
      const acquiredOn = `${year}-${String(6 + (acc % 6)).padStart(2, '0')}-${String(1 + (acc % 27)).padStart(2, '0')}`;
      copies.push({
        bookId: b.id,
        accessionNo: `ACC-${pad(acc)}`,
        barcode: `ACC-${pad(acc)}`,
        rfid: acc % 3 === 0 ? null : `E2801160${String(600000 + acc * 37).padStart(16, '0')}`,
        branchId: /^00/.test(ddc) && j % 2 ? annex.id : main.id,
        atBranchId: /^00/.test(ddc) && j % 2 ? annex.id : main.id,
        shelf: `${ddc.slice(0, 3) || 'GEN'}-${String.fromCharCode(65 + (bi % 6))}${1 + (j % 4)}`,
        acquiredOn: acquiredOn > c.today ? addDays(c.today, -30) : acquiredOn,
        source: bi % 19 === 7 ? 'donation' : 'purchase',
        pricePaise: Number(b.pricePaise) || rupees(395),
        vendor: ['Sapna Book House', 'Prism Books', 'Higginbothams'][acc % 3],
        invoiceNo: `INV/${year}/${100 + (acc % 40)}`,
        status: bi === 4 && j === 0 ? 'damaged' : bi === 9 && j === 1 ? 'missing' : 'available',
      });
    }
  }
  const copyRows = await k.ins<{ id: string; bookId: string; accessionNo: string; status: string }>('library_copies', copies);

  // Loans already in the register take a copy (on loan while out) and the borrower's card.
  const loans = await k.q<{ id: string; bookId: string; studentId: string; returnedAt: string | null; dueOn: string; finePaise: number }>('select id, book_id, student_id, returned_at, due_on, fine_paise from library_loans order by issued_at');
  const free = new Map<string, string[]>();
  for (const cp of copyRows) if (cp.status === 'available') free.set(cp.bookId, [...(free.get(cp.bookId) ?? []), cp.id]);
  for (const l of loans) {
    const pool = free.get(l.bookId) ?? [];
    const copyId = l.returnedAt ? (copyRows.find((x) => x.bookId === l.bookId)?.id ?? null) : (pool.shift() ?? null);
    if (!l.returnedAt && copyId) await k.q("update library_copies set status = 'on_loan' where id = $1", [copyId]);
    const fineDays = l.finePaise ? Math.round(Number(l.finePaise) / 200) : 0;
    await k.q('update library_loans set copy_id = $2, member_id = $3, branch_id = $4, fine_days = $5 where id = $1', [l.id, copyId, memberOf.get(l.studentId)?.id ?? null, main.id, fineDays]);
  }
  // Teachers borrow too: a semester loan each for a few, one of them late.
  const staffLoans: Record<string, unknown>[] = [];
  for (const [i, m] of staffCards.slice(0, 6).entries()) {
    const b = books[(i * 5 + 2) % books.length];
    const copyId = (free.get(b.id) ?? []).shift();
    if (!copyId) continue;
    await k.q("update library_copies set status = 'on_loan' where id = $1", [copyId]);
    const issued = addDays(c.today, -(20 + i * 9));
    staffLoans.push({ bookId: b.id, memberId: m.id, copyId, issuedAt: at(issued, '12:30'), dueOn: addDays(issued, i === 5 ? 40 : 90), issuedBy: lib, branchId: main.id, via: 'desk' });
  }
  await k.ins('library_loans', staffLoans, { returning: false });

  // Overdue notices already sent for the books still out past their due date.
  const overdue = await k.q<{ id: string; dueOn: string }>('select id, due_on::text as due_on from library_loans where returned_at is null and due_on < $1::date order by due_on', [c.today]);
  const notices: Record<string, unknown>[] = [];
  for (const l of overdue) {
    const late = Math.round((Date.parse(`${c.today}T00:00:00Z`) - Date.parse(`${l.dueOn}T00:00:00Z`)) / 86_400_000);
    for (const [step, day] of [['first', 1], ['second', 7], ['final', 15]] as const) if (late >= day) notices.push({ loanId: l.id, step, daysOverdue: day, channels: step === 'first' ? 'app' : 'app,sms', recipients: 2, sentAt: at(addDays(l.dueOn, day), '08:05') });
  }
  await k.ins('library_overdue_notices', notices, { returning: false });
  for (const l of overdue) await k.q('update library_loans set notices_sent = (select count(*) from library_overdue_notices n where n.loan_id = $1), last_notice_at = (select max(sent_at) from library_overdue_notices n where n.loan_id = $1) where id = $1', [l.id]);

  // A fine waiver waiting for the principal.
  const [fined] = await k.q<{ id: string; finePaise: number }>('select id, fine_paise from library_loans where returned_at is not null and fine_paise > 0 and fine_paid_at is null order by fine_paise desc limit 1');
  if (fined) await k.ins('library_fine_waivers', { loanId: fined.id, amountPaise: Math.min(Number(fined.finePaise), rupees(10)), reason: 'Admitted to hospital during the due week (certificate attached at the desk)', requestedBy: lib }, { returning: false });

  // ---- the gate register: this term's working days and last year's, for footfall and NAAC 4.2 -----------------------
  const gate: Record<string, unknown>[] = [];
  const studentCards = cards.filter((m) => m.studentId);
  const visitDays = [...c.workingDays.slice(-40)];
  for (const [d, day] of visitDays.entries()) {
    const n = 28 + ((d * 13) % 25);
    for (let i = 0; i < n; i++) {
      const m = studentCards[(d * 31 + i * 7) % studentCards.length];
      const h = 9 + (i % 7);
      gate.push({ memberId: m.id, purpose: ['reading', 'borrow', 'reference', 'eresources'][i % 4], branchId: i % 5 === 0 ? annex.id : main.id, inAt: at(day, `${String(h).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`), outAt: at(day, `${String(h + 1).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}`), recordedBy: lib });
    }
    for (let i = 0; i < 4 + (d % 4); i++) gate.push({ memberId: staffCards[(d + i * 3) % staffCards.length].id, purpose: 'reference', branchId: main.id, inAt: at(day, `1${i % 6}:20`), outAt: at(day, `1${i % 6}:55`), recordedBy: lib });
    if (d % 6 === 0) gate.push({ visitorName: ['NAAC peer team member', 'Visiting faculty, Christ University', 'Parent of a BCom student'][d % 3], purpose: 'reference', branchId: main.id, inAt: at(day, '11:00'), outAt: at(day, '11:40'), recordedBy: lib });
  }
  // Last financial year: about a hundred and eighty working days at a lower footfall.
  for (let d = 0; d < 180; d++) {
    const day = addDays(`${fy.start - 1}-06-10`, Math.floor(d * 1.6));
    if (weekday(day) === 7 || c.holidays.has(day)) continue;
    for (let i = 0; i < 18 + (d % 11); i++) gate.push({ memberId: studentCards[(d * 17 + i * 5) % studentCards.length].id, purpose: 'reading', branchId: main.id, inAt: at(day, `${10 + (i % 6)}:10`), outAt: at(day, `${11 + (i % 6)}:05`), recordedBy: lib });
    for (let i = 0; i < 3; i++) gate.push({ memberId: staffCards[(d + i) % staffCards.length].id, purpose: 'reference', branchId: main.id, inAt: at(day, `14:${10 + i * 10}`), outAt: at(day, `14:${40 + i * 5}`), recordedBy: lib });
  }
  // Two readers are inside now.
  for (const m of studentCards.slice(3, 5)) gate.push({ memberId: m.id, purpose: 'reading', branchId: main.id, inAt: at(c.today, '10:20'), recordedBy: lib });
  await k.ins('library_gate_log', gate, { returning: false });

  // ---- acquisitions: vendors, budget heads per department, suggestions to purchase orders and invoices ----------------
  const [sapna, prism, informatics, binder] = await k.ins<{ id: string; name: string }>('library_vendors', [
    { name: 'Sapna Book House', kind: 'books', gstin: '29AAACS2468K1Z3', contactPerson: 'Nagaraj K.', phone: '+918040114455', email: 'orders@sapna.demo.zynetix.in', address: 'No. 11, 3rd Main, Gandhinagar, Bengaluru 560009', discountPct: '12.50', paymentTerms: '30 days from the invoice' },
    { name: 'Prism Books Pvt. Ltd.', kind: 'books', gstin: '29AABCP1357L1Z8', contactPerson: 'Shalini Rao', phone: '+918026714108', email: 'library@prism.demo.zynetix.in', address: 'Jayanagar 4th Block, Bengaluru 560011', discountPct: '10', paymentTerms: '45 days' },
    { name: 'Informatics India Ltd.', kind: 'eresources', gstin: '29AAACI5566M1Z2', contactPerson: 'Pradeep M.', phone: '+918040387600', email: 'subscriptions@informatics.demo.zynetix.in', address: 'Malleswaram, Bengaluru 560003', discountPct: '0', paymentTerms: 'Advance for the year' },
    { name: 'Sri Ganesh Book Binders', kind: 'binder', gstin: '29AFKPG9087Q1Z5', contactPerson: 'Ganesh Rao', phone: '+919845098765', address: 'Chickpet, Bengaluru 560053', discountPct: '0', paymentTerms: 'On delivery' },
  ]);
  const dept = (name: string) => c.departments[name] ?? Object.values(c.departments)[0];
  const deptNames = Object.keys(c.departments);
  const commerce = deptNames.find((d) => /commerce/i.test(d)) ?? deptNames[0];
  const computers = deptNames.find((d) => /computer/i.test(d)) ?? deptNames[1] ?? deptNames[0];
  const management = deptNames.find((d) => /management/i.test(d)) ?? deptNames[0];
  const budgetRows = [
    { fiscalYear: fy.label, departmentId: dept(commerce), head: 'books', amountPaise: rupees(150000), note: 'Text and reference books for BCom' },
    { fiscalYear: fy.label, departmentId: dept(computers), head: 'books', amountPaise: rupees(120000), note: 'BCA and MCA titles' },
    { fiscalYear: fy.label, departmentId: dept(management), head: 'books', amountPaise: rupees(90000), note: 'BBA and MBA' },
    { fiscalYear: fy.label, head: 'journals', amountPaise: rupees(85000), note: 'Print journals, magazines and newspapers' },
    { fiscalYear: fy.label, head: 'eresources', amountPaise: rupees(75000), note: 'DELNET, N-LIST and databases' },
    { fiscalYear: fy.label, head: 'other', amountPaise: rupees(15000), note: 'Binding and repairs' },
  ];
  // One head per department and year (a small institution may run several programmes in one department).
  const budgets = await k.ins<{ id: string; head: string; departmentId: string | null }>('library_budgets', budgetRows.filter((b, i) => budgetRows.findIndex((x) => x.head === b.head && (x.departmentId ?? null) === (b.departmentId ?? null)) === i));
  const budget = (head: string, deptId: string | null = null) => budgets.find((b) => b.head === head && (deptId === null || b.departmentId === deptId))!.id;
  const [po1, po2, po3] = await k.ins<{ id: string; number: string }>('library_purchase_orders', [
    { number: 'LPO-0001', vendorId: sapna.id, orderedOn: addDays(c.today, -48), expectedBy: addDays(c.today, -20), discountPct: '12.50', status: 'received', note: 'Latest editions only, please', createdBy: lib, sentAt: at(addDays(c.today, -48), '11:00') },
    { number: 'LPO-0002', vendorId: prism.id, orderedOn: addDays(c.today, -12), expectedBy: addDays(c.today, 10), discountPct: '10', status: 'sent', note: 'Deliver to the Computer Science reading room', createdBy: lib, sentAt: at(addDays(c.today, -12), '15:30') },
    { number: 'LPO-0003', vendorId: sapna.id, expectedBy: addDays(c.today, 30), discountPct: '12.50', status: 'draft', createdBy: lib },
  ]);
  const teacher = (i: number) => c.teachers[i % c.teachers.length];
  const acqRows = [
    { number: 'ACQ-0001', title: 'Financial Accounting for Managers', author: 'Ambrish Gupta', isbn: '9789354499577', quantity: 4, estPricePaise: rupees(675), departmentId: dept(commerce), budgetId: budget('books', dept(commerce)), suggestedBy: teacher(0).id, suggestedByName: teacher(0).name, reason: 'Prescribed for BCom Sem 1 (NEP)', status: 'invoiced', vendor: sapna.name, vendorId: sapna.id, orderNo: 'LPO-0001', orderedOn: addDays(c.today, -48), poId: po1.id, receivedQty: 4, receivedOn: addDays(c.today, -26) },
    { number: 'ACQ-0002', title: 'Business Economics', author: 'H. L. Ahuja', isbn: '9789355012287', quantity: 3, estPricePaise: rupees(560), departmentId: dept(commerce), budgetId: budget('books', dept(commerce)), suggestedBy: teacher(1).id, suggestedByName: teacher(1).name, reason: 'More copies needed: 9 students waiting', status: 'invoiced', vendor: sapna.name, vendorId: sapna.id, orderNo: 'LPO-0001', orderedOn: addDays(c.today, -48), poId: po1.id, receivedQty: 3, receivedOn: addDays(c.today, -26) },
    { number: 'ACQ-0003', title: 'Operating System Concepts', author: 'Silberschatz, Galvin and Gagne', isbn: '9789357460590', quantity: 5, estPricePaise: rupees(895), departmentId: dept(computers), budgetId: budget('books', dept(computers)), suggestedBy: teacher(2).id, suggestedByName: teacher(2).name, reason: 'BCA Sem 3 core paper', status: 'ordered', vendor: prism.name, vendorId: prism.id, orderNo: 'LPO-0002', orderedOn: addDays(c.today, -12), poId: po2.id },
    { number: 'ACQ-0004', title: 'Artificial Intelligence: A Modern Approach', author: 'Russell and Norvig', isbn: '9789356063525', quantity: 2, estPricePaise: rupees(1250), departmentId: dept(computers), budgetId: budget('books', dept(computers)), suggestedBy: teacher(3).id, suggestedByName: teacher(3).name, reason: 'MCA elective', status: 'ordered', vendor: prism.name, vendorId: prism.id, orderNo: 'LPO-0002', orderedOn: addDays(c.today, -12), poId: po2.id },
    { number: 'ACQ-0005', title: 'Organisational Behaviour', author: 'Stephen P. Robbins', isbn: '9789356061743', quantity: 3, estPricePaise: rupees(820), departmentId: dept(management), budgetId: budget('books', dept(management)), suggestedBy: teacher(4).id, suggestedByName: teacher(4).name, reason: 'BBA Sem 2', status: 'approved', poId: po3.id, vendorId: sapna.id, vendor: sapna.name, decidedBy: principal, decidedAt: at(addDays(c.today, -3)) },
    { number: 'ACQ-0006', title: 'Indian Economy', author: 'Ramesh Singh', isbn: '9789355322845', quantity: 2, estPricePaise: rupees(950), departmentId: dept(commerce), budgetId: budget('books', dept(commerce)), suggestedBy: teacher(5).id, suggestedByName: teacher(5).name, reason: 'For competitive exam preparation corner', status: 'suggested' },
    { number: 'ACQ-0007', title: 'Digital Marketing', author: 'Seema Gupta', isbn: '9789390219412', quantity: 2, estPricePaise: rupees(599), departmentId: dept(management), suggestedByName: 'Student suggestion box', reason: 'Asked for by BBA students', status: 'suggested' },
    { number: 'ACQ-0008', title: 'Learn Kannada in 30 Days', author: 'K. Srinivasachari', quantity: 1, estPricePaise: rupees(150), suggestedByName: 'Student suggestion box', reason: 'Duplicate of a title we hold', status: 'rejected', decidedBy: lib, decidedAt: at(addDays(c.today, -9)), decisionNote: 'Two copies are on the shelf already (494.81 SRI)' },
  ];
  const acqs = await k.ins<{ id: string; number: string; quantity: number; estPricePaise: number; status: string; title: string; author: string; isbn: string; departmentId: string | null }>('library_acquisitions', acqRows);
  // Received lines went into the catalogue and the register; the invoice shares its net amount over them.
  const gross = acqs.filter((a) => a.status === 'invoiced').reduce((s, a) => s + a.quantity * Number(a.estPricePaise), 0);
  const discount = Math.round(gross * 0.125);
  const [inv] = await k.ins<{ id: string }>('library_invoices', [{ vendorId: sapna.id, poId: po1.id, invoiceNo: 'SBH/2026/1187', invoiceDate: addDays(c.today, -25), grossPaise: gross, discountPaise: discount, gstPaise: 0, netPaise: gross - discount, status: 'passed', note: 'Books are exempt from GST', createdBy: lib }]);
  await k.ins('library_invoices', [{ vendorId: informatics.id, invoiceNo: 'IIL/24-25/3391', invoiceDate: `${fy.start}-04-12`, grossPaise: rupees(59000), discountPaise: 0, gstPaise: rupees(10620), netPaise: rupees(69620), status: 'paid', paidOn: `${fy.start}-04-20`, paymentRef: 'UTR SBIN426110455812', note: 'DELNET and N-LIST, one year', createdBy: lib }], { returning: false });
  let left = gross - discount;
  const invoiced = acqs.filter((a) => a.status === 'invoiced');
  for (const [i, a] of invoiced.entries()) {
    const share = i === invoiced.length - 1 ? left : Math.floor(((gross - discount) * a.quantity * Number(a.estPricePaise)) / gross);
    left -= share;
    const [book] = await k.ins<{ id: string }>('library_books', [{ title: a.title, author: a.author, isbn: a.isbn || null, departmentId: a.departmentId, pricePaise: a.estPricePaise, copies: a.quantity, material: 'book', classScheme: 'ddc' }]);
    const made = Array.from({ length: a.quantity }, () => ++acc);
    await k.ins('library_copies', made.map((n) => ({ bookId: book.id, accessionNo: `ACC-${pad(n)}`, barcode: `ACC-${pad(n)}`, rfid: `E2801160${String(600000 + n * 37).padStart(16, '0')}`, branchId: main.id, atBranchId: main.id, shelf: 'NEW-A1', acquiredOn: addDays(c.today, -26), source: 'purchase', pricePaise: a.estPricePaise, vendor: sapna.name, invoiceNo: 'SBH/2026/1187', acquisitionId: a.id })), { returning: false });
    await k.q('update library_acquisitions set book_id = $2, invoice_id = $3, invoice_no = $4, invoice_date = $5, invoice_amount_paise = $6 where id = $1', [a.id, book.id, inv.id, 'SBH/2026/1187', addDays(c.today, -25), share]);
  }

  // ---- serials: journals, magazines and newspapers with their issues ------------------------------------------------
  const serials = await k.ins<{ id: string; frequency: string; title: string }>('library_periodicals', [
    { title: 'The Indian Journal of Commerce', issn: '0019-512X', publisher: 'Indian Commerce Association', kind: 'journal', frequency: 'quarterly', language: 'English', departmentId: dept(commerce), vendor: 'Informatics India Ltd.', vendorId: informatics.id, subscriptionFrom: `${fy.start}-04-01`, subscriptionTo: `${fy.start + 1}-03-31`, costPaise: rupees(2500), budgetId: budget('journals') },
    { title: 'Vikalpa: The Journal for Decision Makers', issn: '0256-0909', publisher: 'IIM Ahmedabad', kind: 'journal', frequency: 'quarterly', language: 'English', departmentId: dept(management), vendor: 'Informatics India Ltd.', vendorId: informatics.id, subscriptionFrom: `${fy.start}-04-01`, subscriptionTo: `${fy.start + 1}-03-31`, costPaise: rupees(4200), budgetId: budget('journals') },
    { title: 'Communications of the ACM', issn: '0001-0782', publisher: 'ACM', kind: 'journal', frequency: 'monthly', language: 'English', departmentId: dept(computers), vendor: 'Informatics India Ltd.', vendorId: informatics.id, subscriptionFrom: `${fy.start}-04-01`, subscriptionTo: `${fy.start + 1}-03-31`, costPaise: rupees(18500), budgetId: budget('journals') },
    { title: 'Business Today', issn: '0971-9474', publisher: 'Living Media', kind: 'magazine', frequency: 'fortnightly', language: 'English', vendor: 'Sapna Book House', vendorId: sapna.id, subscriptionFrom: `${fy.start}-04-01`, subscriptionTo: `${fy.start + 1}-03-31`, costPaise: rupees(1800), budgetId: budget('journals') },
    { title: 'Prajavani', publisher: 'The Printers (Mysore)', kind: 'newspaper', frequency: 'daily', language: 'Kannada', vendor: 'Local agent', subscriptionFrom: `${fy.start}-04-01`, subscriptionTo: `${fy.start + 1}-03-31`, costPaise: rupees(2900), budgetId: budget('journals') },
    { title: 'Economic and Political Weekly', issn: '0012-9976', publisher: 'Sameeksha Trust', kind: 'journal', frequency: 'weekly', language: 'English', departmentId: dept(commerce), vendor: 'Informatics India Ltd.', vendorId: informatics.id, subscriptionFrom: `${fy.start - 1}-04-01`, subscriptionTo: `${fy.start}-03-31`, costPaise: rupees(3600), status: 'cancelled' },
  ]);
  const step: Record<string, number> = { quarterly: 91, monthly: 30, fortnightly: 14, weekly: 7, daily: 1 };
  const issues: Record<string, unknown>[] = [];
  for (const [si, s] of serials.slice(0, 4).entries()) {
    const every = step[s.frequency];
    let n = 0;
    for (let d = `${fy.start}-04-01`; d <= addDays(c.today, 40); d = addDays(d, every)) {
      n++;
      const past = d <= c.today;
      const missing = past && si === n % 4 && addDays(d, 15) < c.today;
      issues.push({ periodicalId: s.id, label: `Vol. ${fy.start - 1960 + si}, No. ${n} (${d})`, expectedOn: d, status: !past ? 'expected' : missing ? (n % 2 ? 'claimed' : 'missing') : 'received', receivedOn: past && !missing ? addDays(d, 3) : null, claimedOn: missing && n % 2 ? addDays(d, 16) : null, claimCount: missing && n % 2 ? 1 + (n % 3 === 0 ? 1 : 0) : 0, claimNote: missing && n % 2 ? 'Not received; please send a replacement copy' : '' });
    }
  }
  await k.ins('library_periodical_issues', issues, { returning: false });

  // ---- e-resources: the consortia and databases, with their cost and the providers' monthly counts --------------------
  await k.q("update library_eresources set provider = case when publisher = 'NPTEL' then 'swayam' when publisher = 'Open Textbook Library' then 'open' else 'publisher' end, access_mode = case when publisher in ('NPTEL', 'Open Textbook Library') then 'open' else 'ip' end, ip_ranges = '103.21.164.0/24', subscription_from = $2::date, cost_paise = case when publisher = 'EBSCO' then 4800000 when publisher = 'Indian Accounting Association' then 350000 else 0 end, vendor_id = $3::uuid where tenant_id = $1::uuid", [tid, `${fy.start}-04-01`, informatics.id]);
  const eres = await k.ins<{ id: string; title: string }>('library_eresources', [
    { title: 'DELNET: Developing Library Network', kind: 'database', provider: 'delnet', publisher: 'DELNET, New Delhi', url: 'https://delnet.in', accessMode: 'remote', remoteAccess: 'Sign in at delnet.in with the institutional ID from the desk; inter-library loan requests go through the librarian', subjects: 'Union catalogue, e-journals, inter-library loan', costPaise: rupees(20000), subscriptionFrom: `${fy.start}-04-01`, licenceUntil: `${fy.start + 1}-03-31`, vendorId: informatics.id, budgetId: budget('eresources'), createdBy: lib },
    { title: 'N-LIST e-journals and e-books', kind: 'journal', provider: 'nlist', publisher: 'INFLIBNET Centre', url: 'https://nlist.inflibnet.ac.in', accessMode: 'remote', remoteAccess: 'Each member gets their own N-LIST login from the library (6,000+ e-journals, 1.99 lakh e-books)', subjects: 'All subjects', costPaise: rupees(5900), subscriptionFrom: `${fy.start}-04-01`, licenceUntil: `${fy.start + 1}-03-31`, vendorId: informatics.id, budgetId: budget('eresources'), createdBy: lib },
    { title: 'e-ShodhSindhu: JSTOR (consortium)', kind: 'database', provider: 'eshodhsindhu', publisher: 'INFLIBNET Centre', url: 'https://ess.inflibnet.ac.in', accessMode: 'ip', ipRanges: '103.21.164.0/24', subjects: 'Economics, management, humanities', costPaise: rupees(12500), subscriptionFrom: `${fy.start}-04-01`, licenceUntil: `${fy.start + 1}-03-31`, seats: 25, vendorId: informatics.id, budgetId: budget('eresources'), createdBy: lib },
    { title: 'National Digital Library of India', kind: 'database', provider: 'ndl', publisher: 'IIT Kharagpur', url: 'https://ndl.iitkgp.ac.in', accessMode: 'open', subjects: 'All subjects', createdBy: lib },
    { title: 'Shodhganga: Indian theses', kind: 'database', provider: 'shodhganga', publisher: 'INFLIBNET Centre', url: 'https://shodhganga.inflibnet.ac.in', accessMode: 'open', subjects: 'Doctoral theses', createdBy: lib },
  ]);
  const allEres = await k.q<{ id: string; title: string; costPaise: number }>('select id, title, cost_paise from library_eresources order by created_at');
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${c.today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (6 - i));
    return d.toISOString().slice(0, 7);
  });
  await k.ins('library_eresource_usage', allEres.filter((e) => Number(e.costPaise) > 0).flatMap((e, ei) => months.map((m, mi) => ({ resourceId: e.id, month: m, sessions: 60 + ((ei * 37 + mi * 19) % 140), searches: 150 + ((ei * 53 + mi * 41) % 420), downloads: 20 + ((ei * 23 + mi * 17) % 110), source: 'provider' }))), { returning: false });
  const readers = c.students.filter((s) => s.userId).slice(0, 30).map((s) => s.userId!);
  await k.ins('library_eresource_access', eres.slice(0, 3).flatMap((e, i) => readers.slice(0, 12 + i * 6).map((u, j) => ({ resourceId: e.id, userId: u, accessedAt: at(addDays(c.today, -((i * 3 + j) % 28)), `1${j % 8}:${String(10 + j).padStart(2, '0')}`) }))), { returning: false });

  // ---- binding: one batch back from the binder, one there now -------------------------------------------------------
  const shelfCopies = await k.q<{ id: string; accessionNo: string; title: string; status: string; bookId: string }>("select c.id, c.accession_no, b.title, c.status, c.book_id from library_copies c join library_books b on b.id = c.book_id where c.status in ('available', 'damaged') order by c.accession_no desc limit 6");
  const [back, atBinder] = await k.ins<{ id: string }>('library_binding_batches', [
    { number: 'LBB-0001', vendorId: binder.id, sentOn: addDays(c.today, -40), expectedOn: addDays(c.today, -25), receivedOn: addDays(c.today, -27), status: 'received', costPaise: rupees(1450), budgetId: budget('other'), note: 'Last year’s journals bound by volume', createdBy: lib },
    { number: 'LBB-0002', vendorId: binder.id, sentOn: addDays(c.today, -6), expectedOn: addDays(c.today, 9), status: 'sent', costPaise: rupees(960), budgetId: budget('other'), note: 'Loose spines and torn covers', createdBy: lib },
  ]);
  await k.ins('library_binding_items', [
    ...serials.slice(0, 2).map((s) => ({ batchId: back.id, periodicalId: s.id, label: `${s.title}, volume ${fy.start - 1}`, priorStatus: 'available', instructions: 'Half leather, title on the spine' })),
    ...shelfCopies.slice(0, 3).map((cp) => ({ batchId: atBinder.id, copyId: cp.id, label: `${cp.accessionNo} ${cp.title}`.slice(0, 200), priorStatus: cp.status, instructions: 'Re-sew and new cover' })),
  ], { returning: false });
  for (const cp of shelfCopies.slice(0, 3)) await k.q("update library_copies set status = 'binding' where id = $1", [cp.id]);

  // ---- inter-library loan and the institutional repository ------------------------------------------------------------
  await k.ins('library_ill', [
    { direction: 'borrow', network: 'delnet', partner: 'IIM Bangalore Library', title: 'Behavioural Finance', author: 'Prasanna Chandra', memberId: staffCards[0]?.id ?? null, requestedOn: addDays(c.today, -10), dueOn: addDays(c.today, 11), status: 'in_hand', chargePaise: rupees(150), note: 'Through DELNET', createdBy: lib },
    { direction: 'lend', network: 'direct', partner: 'Mount Carmel College Library', title: 'Air Cargo Management', author: 'Michael Sales', requestedOn: addDays(c.today, -20), dueOn: addDays(c.today, -2), status: 'returned', createdBy: lib },
  ], { returning: false });
  await k.ins('library_repository', [
    { title: 'Customer satisfaction with UPI payments among students of Bengaluru', authors: 'Ananya Rao, Kiran Gowda', kind: 'project', departmentId: dept(commerce), year: fy.start, abstract: 'A survey of 220 students on how they use UPI and what makes them trust it.', keywords: 'UPI, digital payments, trust', url: 'https://repository.demo.zynetix.in/items/1', access: 'campus', status: 'published', views: 41, createdBy: lib },
    { title: 'A machine learning model for predicting student attendance', authors: 'Mohammed Faiz', kind: 'project', departmentId: dept(computers), year: fy.start, abstract: 'Random forest on two years of hour-wise attendance.', keywords: 'machine learning, attendance', url: 'https://repository.demo.zynetix.in/items/2', access: 'open', status: 'published', views: 63, createdBy: lib },
    { title: 'Question papers: BCom semester end, previous year', authors: 'Examination section', kind: 'question_paper', departmentId: dept(commerce), year: fy.start - 1, url: 'https://repository.demo.zynetix.in/items/3', access: 'campus', status: 'published', views: 212, createdBy: lib },
  ], { returning: false });

  // ---- numbering: the next accession, card, request, order and batch numbers follow the seeded ones ------------------
  for (const [kind, last] of [['ACC', acc], ['MEM', lastCard], ['ACQ', acqRows.length], ['LPO', 3], ['LBB', 2]] as const)
    await k.q('insert into doc_counters (tenant_id, kind, last_no) values ($1, $2, $3) on conflict (tenant_id, kind) do update set last_no = greatest(doc_counters.last_no, excluded.last_no)', [tid, kind, last]);
  void r;
}
