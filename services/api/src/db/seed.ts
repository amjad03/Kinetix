/**
 * Demo data: a Bangalore University–affiliated UG/PG college with one board.
 * Usage: pnpm db:seed   (prints the board enrolment code and staff logins)
 */
import argon2 from 'argon2';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { enrollmentCode, hmac } from '../common/crypto.js';
import { importContent } from '../content/import.js';
import { shortDate } from '../notifications/notifications.service.js';
import { loadEnv } from '../config/env.js';
import { mondayOf, periodDates, spreadTopics } from '../plans/planner.js';
import { addDays, isoWeekday } from '../teacher/teacher.service.js';
import * as s from './schema.js';

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema: s });

const PASSWORD = 'kinetix123';

async function main() {
  // The demo has known passwords: never load it into a real deployment by accident.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes') {
    console.error('Refusing to load demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=yes for a staging demo.');
    process.exitCode = 1;
    return;
  }
  const existing = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.slug, 'demo-college') });
  if (existing) {
    console.log('Demo tenant already exists. Drop the database to reseed.');
    return;
  }
  const hash = await argon2.hash(PASSWORD);
  const library = await importContent(db);
  const course = async (code: string) => (await db.query.courses.findFirst({ where: (c, { eq }) => eq(c.code, code) }))?.id ?? null;

  const [tenant] = await db
    .insert(s.tenants)
    .values({ slug: 'demo-college', name: 'KINETIX Demo College of Commerce & Science', kind: 'college', settings: { liveViewEnabled: true, liveViewIndicator: true } })
    .returning();
  const tenantId = tenant.id;
  const [campus] = await db.insert(s.campuses).values({ tenantId, name: 'Main Campus', city: 'Bengaluru' }).returning();
  const [year] = await db.insert(s.academicYears).values({ tenantId, label: '2026-27', startsOn: '2026-08-01', endsOn: '2027-05-31', isCurrent: true }).returning();
  // Recordings are kept until their semester ends (plus the grace period in Settings).
  await db.insert(s.academicTerms).values({ tenantId, academicYearId: year.id, name: 'Odd semester 2026', startsOn: '2026-08-01', endsOn: '2026-12-15' });

  const [bcom] = await db.insert(s.programs).values({ tenantId, campusId: campus.id, name: 'BCom', level: 'ug', curriculumCode: 'bu-ug', termCount: 6 }).returning();
  const [bca] = await db.insert(s.programs).values({ tenantId, campusId: campus.id, name: 'BCA', level: 'ug', curriculumCode: 'bu-ug', termCount: 6 }).returning();
  const [mcom] = await db.insert(s.programs).values({ tenantId, campusId: campus.id, name: 'MCom', level: 'pg', curriculumCode: 'bu-pg', termCount: 4 }).returning();

  const [bcom3a] = await db.insert(s.sections).values({ tenantId, programId: bcom.id, academicYearId: year.id, term: 3, name: 'A', displayName: 'BCom Sem 3 A' }).returning();
  const [bca1a] = await db.insert(s.sections).values({ tenantId, programId: bca.id, academicYearId: year.id, term: 1, name: 'A', displayName: 'BCA Sem 1 A' }).returning();
  await db.insert(s.sections).values({ tenantId, programId: mcom.id, academicYearId: year.id, term: 1, name: 'A', displayName: 'MCom Sem 1 A' });

  const [corpAcc] = await db.insert(s.subjects).values({ tenantId, programId: bcom.id, term: 3, code: 'BCOM-3.1', name: 'Corporate Accounting', courseId: await course('bcom-3-corporate-accounting') }).returning();
  const [costing] = await db.insert(s.subjects).values({ tenantId, programId: bcom.id, term: 3, code: 'BCOM-3.3', name: 'Cost Accounting', courseId: await course('bcom-3-cost-accounting') }).returning();
  const [dmaths] = await db.insert(s.subjects).values({ tenantId, programId: bca.id, term: 1, code: 'BCA-1.2', name: 'Discrete Mathematics', courseId: await course('bca-1-discrete-mathematics') }).returning();

  const staff = async (fullName: string, email: string, roles: (typeof s.roleName.enumValues)[number][], lang: 'en' | 'hi' | 'kn' = 'en') => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName, email, passwordHash: hash, preferredLanguage: lang }).returning();
    for (const role of roles) await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId: campus.id });
    return u;
  };
  await staff('Dr. Meera Rao', 'principal@demo.kinetix.in', ['principal']);
  const admin = await staff('Admin Office', 'admin@demo.kinetix.in', ['tenant_admin']);
  await staff('Accounts Office', 'accounts@demo.kinetix.in', ['accountant']);
  const librarian = await staff('Library Desk', 'library@demo.kinetix.in', ['librarian']);
  const anita = await staff('Anita Sharma', 'anita@demo.kinetix.in', ['teacher'], 'hi');
  const ravi = await staff('Ravi Kumar', 'ravi@demo.kinetix.in', ['teacher', 'hod'], 'kn');

  // Departments: Ravi heads Commerce (Anita teaches there) and also teaches in Computer Science.
  const [commerce] = await db.insert(s.departments).values({ tenantId, name: 'Commerce', headUserId: ravi.id }).returning();
  const [compsci] = await db.insert(s.departments).values({ tenantId, name: 'Computer Science' }).returning();
  await db.insert(s.departmentStaff).values([
    { tenantId, departmentId: commerce.id, userId: anita.id },
    { tenantId, departmentId: commerce.id, userId: ravi.id },
    { tenantId, departmentId: compsci.id, userId: ravi.id },
  ]);
  await db.update(s.subjects).set({ departmentId: commerce.id }).where(inArray(s.subjects.id, [corpAcc.id, costing.id]));
  await db.update(s.subjects).set({ departmentId: compsci.id }).where(eq(s.subjects.id, dmaths.id));

  const names = ['Aarav Patel', 'Ananya Gowda', 'Bhavya Reddy', 'Chetan Naik', 'Deepika Hegde', 'Farhan Khan', 'Gauri Shetty', 'Harsh Jain', 'Ishita Rao', 'Karthik Murthy', 'Lakshmi Iyer', 'Manoj Bhat'];
  await db.insert(s.students).values(names.map((fullName, i) => ({ tenantId, sectionId: bcom3a.id, rollNo: `U03BC${(i + 1).toString().padStart(3, '0')}`, fullName })));
  const bcaNames = ['Diya Patel', 'Rohan Desai', 'Sneha Kulkarni', 'Vikram Rao', 'Pooja Nair', 'Arjun Menon', 'Kavya Reddy', 'Nikhil Joshi'];
  await db.insert(s.students).values(bcaNames.map((fullName, i) => ({ tenantId, sectionId: bca1a.id, rollNo: `U01CA${(i + 1).toString().padStart(3, '0')}`, fullName })));

  const [room] = await db.insert(s.rooms).values({ tenantId, campusId: campus.id, name: 'Room 204' }).returning();

  // Mon–Sat, five 55-minute periods. Anita teaches BCom 3A, Ravi teaches BCA 1A, both in Room 204.
  const periods = [['09:00', '09:55'], ['10:00', '10:55'], ['11:15', '12:10'], ['12:15', '13:10'], ['14:00', '14:55']];
  for (let day = 1; day <= 6; day++) {
    for (const [i, [start, end]] of periods.entries()) {
      const anitaTeaches = (i + day) % 2 === 0;
      await db.insert(s.timetableSlots).values({
        tenantId,
        academicYearId: year.id,
        sectionId: anitaTeaches ? bcom3a.id : bca1a.id,
        subjectId: anitaTeaches ? (i % 3 === 0 ? costing.id : corpAcc.id) : dmaths.id,
        teacherId: anitaTeaches ? anita.id : ravi.id,
        roomId: room.id,
        dayOfWeek: day,
        startsAt: start,
        endsAt: end,
      });
    }
  }

  // Families: Rajesh Patel has two children (BCom and BCA); Sunita Gowda has one.
  const allStudents = await db.select().from(s.students).where(eq(s.students.tenantId, tenantId));
  const byName = (n: string) => allStudents.find((x) => x.fullName === n)!;
  const parent = async (fullName: string, email: string, phone: string, kids: [string, string][]) => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName, email, phone, passwordHash: hash }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role: 'guardian', campusId: campus.id });
    for (const [kid, relation] of kids) await db.insert(s.guardians).values({ tenantId, userId: u.id, studentId: byName(kid).id, relation });
    return u;
  };
  const rajesh = await parent('Rajesh Patel', 'parent@demo.kinetix.in', '+919800000001', [['Aarav Patel', 'father'], ['Diya Patel', 'father']]);
  await parent('Sunita Gowda', 'sunita@demo.kinetix.in', '+919800000002', [['Ananya Gowda', 'mother']]);

  // Rajesh asked Anita about Aarav's absence; she replied.
  const [chat] = await db
    .insert(s.conversations)
    .values({ tenantId, studentId: byName('Aarav Patel').id, staffId: anita.id, familyId: rajesh.id, lastMessageAt: new Date(Date.now() - 20 * 3600_000), staffReadAt: new Date(Date.now() - 20 * 3600_000) })
    .returning();
  await db.insert(s.messages).values([
    { tenantId, conversationId: chat.id, senderId: rajesh.id, body: 'Good morning ma’am. Aarav had fever on Tuesday, so he missed Corporate Accounting. Could you share what was covered?', createdAt: new Date(Date.now() - 26 * 3600_000) },
    { tenantId, conversationId: chat.id, senderId: anita.id, body: 'Hope he is better now. The lesson recording and the board are shared in the app; please ask him to try Exercise 4.2.', createdAt: new Date(Date.now() - 20 * 3600_000) },
  ]);

  // A student login for the Student App: Aarav.
  const [aaravUser] = await db.insert(s.users).values({ tenantId, fullName: 'Aarav Patel', email: 'aarav@demo.kinetix.in', passwordHash: hash }).returning();
  await db.insert(s.userRoles).values({ tenantId, userId: aaravUser.id, role: 'student', campusId: campus.id });
  await db.update(s.students).set({ userId: aaravUser.id }).where(eq(s.students.id, byName('Aarav Patel').id));

  // Library: a small catalogue; Aarav has one book out (due soon) and Diya one overdue.
  const books = await db
    .insert(s.libraryBooks)
    .values([
      { tenantId, title: 'Corporate Accounting', author: 'S. N. Maheshwari', callNo: '657.95 MAH', copies: 4 },
      { tenantId, title: 'Cost Accounting: Principles and Practice', author: 'M. N. Arora', callNo: '657.42 ARO', copies: 3 },
      { tenantId, title: 'Discrete Mathematics and Its Applications', author: 'Kenneth H. Rosen', callNo: '511.1 ROS', copies: 2 },
      { tenantId, title: 'Let Us C', author: 'Yashavant Kanetkar', callNo: '005.133 KAN', copies: 2 },
      { tenantId, title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam', callNo: '920 KAL', copies: 2 },
    ])
    .returning();
  const isoDay = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
  await db.insert(s.libraryLoans).values([
    { tenantId, bookId: books[0].id, studentId: byName('Aarav Patel').id, issuedAt: new Date(Date.now() - 9 * 86400_000), dueOn: isoDay(5), issuedBy: librarian.id },
    { tenantId, bookId: books[2].id, studentId: byName('Diya Patel').id, issuedAt: new Date(Date.now() - 18 * 86400_000), dueOn: isoDay(-4), issuedBy: librarian.id },
  ]);

  // Marks: Anita's published unit test for BCom Sem 3 A.
  const bcomKids = allStudents.filter((x) => x.sectionId === bcom3a.id).sort((a, b) => a.rollNo.localeCompare(b.rollNo));
  const [unitTest] = await db
    .insert(s.assessments)
    .values({ tenantId, sectionId: bcom3a.id, subjectId: corpAcc.id, title: 'Unit test 1: Underwriting of shares', kind: 'test', maxMarks: 25, heldOn: isoDay(-6), publishedAt: new Date(Date.now() - 3 * 86400_000), createdBy: anita.id })
    .returning();
  await db.insert(s.marks).values(
    bcomKids.map((st, i) => (i === 7 ? { tenantId, assessmentId: unitTest.id, studentId: st.id, marks: null, absent: true } : { tenantId, assessmentId: unitTest.id, studentId: st.id, marks: [19, 22.5, 17, 24, 13, 20, 21.5, 0, 16, 23, 18, 11.5][i] })),
  );

  // Fees: Semester tuition for both classes. Sunita has paid Ananya's at the counter.
  const issueFee = async (sectionId: string, title: string, amountPaise: number, dueInDays: number) => {
    const batchId = crypto.randomUUID();
    const dueOn = new Date(Date.now() + dueInDays * 86400_000).toISOString().slice(0, 10);
    return db
      .insert(s.feeInvoices)
      .values(allStudents.filter((x) => x.sectionId === sectionId).map((st) => ({ tenantId, studentId: st.id, sectionId, batchId, title, amountPaise, dueOn, createdBy: admin.id })))
      .returning();
  };
  const bcomFees = await issueFee(bcom3a.id, 'Semester 3 tuition fee', 42_500_00, 10);
  await issueFee(bca1a.id, 'Semester 1 tuition fee', 48_000_00, 10);
  await issueFee(bcom3a.id, 'Exam fee (Nov 2026)', 1_850_00, -2);
  const ananyaFee = bcomFees.find((f) => f.studentId === byName('Ananya Gowda').id)!;
  const fy = new Date().getMonth() + 1 >= 4 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const financialYear = `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
  await db.insert(s.feePayments).values({
    tenantId,
    invoiceId: ananyaFee.id,
    studentId: ananyaFee.studentId,
    amountPaise: ananyaFee.amountPaise,
    method: 'upi',
    status: 'paid',
    reference: 'UPI 4182 7730 9921',
    receiptNo: `RCPT/${financialYear}/00001`,
    recordedBy: admin.id,
    paidAt: new Date(Date.now() - 3 * 86400_000),
  });
  await db.update(s.feeInvoices).set({ paidPaise: ananyaFee.amountPaise, status: 'paid' }).where(eq(s.feeInvoices.id, ananyaFee.id));
  await db.insert(s.receiptCounters).values({ tenantId, financialYear, lastNo: 1 });

  // Two weeks of history so the parent app and the dashboard have something to show.
  const slots = await db.select().from(s.timetableSlots).where(eq(s.timetableSlots.tenantId, tenantId));
  const today = new Date();
  for (let back = 14; back >= 1; back--) {
    const d = new Date(today.getTime() - back * 86400_000);
    const date = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay() || 7;
    for (const slot of slots.filter((x) => x.dayOfWeek === weekday)) {
      const klass = allStudents.filter((x) => x.sectionId === slot.sectionId);
      for (const [i, st] of klass.entries()) {
        // A few deterministic absences: Aarav misses one period in five, others rarely.
        const absent = st.fullName === 'Aarav Patel' ? (back + i) % 5 === 0 : (back * 7 + i * 3) % 23 === 0;
        const late = !absent && (back + i * 5) % 29 === 0;
        await db.insert(s.attendanceRecords).values({
          tenantId,
          studentId: st.id,
          sectionId: slot.sectionId,
          date,
          timetableSlotId: slot.id,
          status: absent ? 'absent' : late ? 'late' : 'present',
          markedBy: slot.teacherId,
          occurredAt: new Date(`${date}T${slot.startsAt}+05:30`),
        });
      }
      // Two students answer a question in each period.
      for (const [j, st] of klass.slice((back * 3) % klass.length).slice(0, 2).entries()) {
        await db.insert(s.participationEvents).values({
          tenantId,
          studentId: st.id,
          subjectId: slot.subjectId,
          // Vary by day, student and turn so each student has a realistic mix.
          outcome: (['correct', 'correct', 'partial', 'incorrect', 'correct'] as const)[(back * 3 + klass.indexOf(st) * 2 + j) % 5],
          recordedBy: slot.teacherId,
          occurredAt: new Date(`${date}T${slot.startsAt}+05:30`),
        });
      }
    }
  }
  const inDays = (n: number) => new Date(today.getTime() + n * 86400_000).toISOString().slice(0, 10);
  await db.insert(s.homework).values([
    { tenantId, sectionId: bcom3a.id, subjectId: corpAcc.id, createdBy: anita.id, title: 'Exercise 4.2: Issue of shares', instructions: 'Solve questions 1 to 5 from the textbook. Show journal entries for each.', dueOn: inDays(2) },
    { tenantId, sectionId: bcom3a.id, subjectId: costing.id, createdBy: anita.id, title: 'Cost sheet practice', instructions: 'Prepare a cost sheet for the case on page 112.', dueOn: inDays(5) },
    { tenantId, sectionId: bca1a.id, subjectId: dmaths.id, createdBy: ravi.id, title: 'Sets and relations: worksheet 3', instructions: 'All questions. Draw Venn diagrams where needed.', dueOn: inDays(3) },
    { tenantId, sectionId: bcom3a.id, subjectId: corpAcc.id, createdBy: anita.id, title: 'Forfeiture of shares: notes', instructions: 'Read chapter 4.3 and write a one-page summary.', dueOn: inDays(-3) },
  ]);

  // Academic calendar 2026-27 (dates for the demo; each institution keeps its own).
  const principalUser = (await db.select().from(s.users).where(eq(s.users.email, 'principal@demo.kinetix.in')))[0];
  await db.insert(s.calendarEvents).values([
    { tenantId, kind: 'holiday', title: 'Gandhi Jayanti', startsOn: '2026-10-02', endsOn: '2026-10-02', createdBy: principalUser.id },
    { tenantId, kind: 'holiday', title: 'Dasara holidays', startsOn: '2026-10-19', endsOn: '2026-10-21', createdBy: principalUser.id },
    { tenantId, kind: 'holiday', title: 'Kannada Rajyotsava', startsOn: '2026-11-01', endsOn: '2026-11-01', createdBy: principalUser.id },
    { tenantId, kind: 'exam', title: 'Mid-semester exams', startsOn: '2026-11-16', endsOn: '2026-11-20', programIds: [bcom.id], createdBy: principalUser.id },
    { tenantId, kind: 'event', title: 'Annual sports day', startsOn: '2026-12-12', endsOn: '2026-12-12', createdBy: principalUser.id },
    { tenantId, kind: 'holiday', title: 'Christmas', startsOn: '2026-12-25', endsOn: '2026-12-25', createdBy: principalUser.id },
  ]);

  // Syllabus coverage: Anita has taught the first topics of Corporate Accounting to BCom 3A.
  if (corpAcc.courseId) {
    const firstTopics = await db
      .select({ id: s.topics.id })
      .from(s.topics)
      .innerJoin(s.chapters, eq(s.chapters.id, s.topics.chapterId))
      .where(eq(s.chapters.courseId, corpAcc.courseId))
      .orderBy(s.chapters.position, s.topics.position)
      .limit(4);
    if (firstTopics.length) {
      await db.insert(s.topicCoverage).values(firstTopics.map((t, i) => ({ tenantId, sectionId: bcom3a.id, topicId: t.id, coveredOn: inDays(-14 + i * 3), coveredBy: anita.id })));
    }
  }

  // Year plan: Corporate Accounting for BCom 3A over 16 weeks from three weeks ago, holidays skipped.
  if (corpAcc.courseId) {
    const caTopics = await db
      .select({ id: s.topics.id, title: s.topics.title })
      .from(s.topics)
      .innerJoin(s.chapters, eq(s.chapters.id, s.topics.chapterId))
      .where(eq(s.chapters.courseId, corpAcc.courseId))
      .orderBy(s.chapters.position, s.topics.position);
    const caSlots = await db.select().from(s.timetableSlots).where(eq(s.timetableSlots.subjectId, corpAcc.id));
    const planStart = mondayOf(inDays(-21));
    const planEnd = addDays(planStart, 16 * 7 - 1);
    const holidayDays = new Set<string>();
    for (const h of await db.select().from(s.calendarEvents).where(eq(s.calendarEvents.tenantId, tenantId))) {
      if (h.kind === 'event') continue;
      for (let d = h.startsOn; d <= h.endsOn; d = addDays(d, 1)) holidayDays.add(d);
    }
    const dates = periodDates(caSlots.map((x) => x.dayOfWeek), planStart, planEnd, (d) => holidayDays.has(d));
    const [plan] = await db.insert(s.yearPlans).values({ tenantId, sectionId: bcom3a.id, subjectId: corpAcc.id, startsOn: planStart, endsOn: planEnd, createdBy: anita.id }).returning();
    await db.insert(s.yearPlanItems).values(spreadTopics(caTopics.map((x) => x.id), dates).map((i) => ({ tenantId, planId: plan.id, ...i })));

    // Anita's lesson plan for her next Corporate Accounting period.
    for (let d = 0; d < 7; d++) {
      const date = inDays(d);
      const slot = caSlots.find((x) => x.dayOfWeek === isoWeekday(date));
      if (!slot || holidayDays.has(date)) continue;
      const topic = caTopics[4] ?? caTopics[0];
      await db.insert(s.lessonPlans).values({
        tenantId,
        sectionId: bcom3a.id,
        subjectId: corpAcc.id,
        timetableSlotId: slot.id,
        date,
        teacherId: anita.id,
        topicIds: [topic.id],
        content: {
          objectives: [`Explain ${topic.title.toLowerCase()} with journal entries`, 'Solve one textbook problem in class'],
          steps: [
            { minutes: 5, activity: 'Recap of the last class with two quick questions' },
            { minutes: 20, activity: `Explain ${topic.title} on the board with a worked example` },
            { minutes: 20, activity: 'Students solve Exercise 4.2 Q1 in pairs; discuss answers' },
            { minutes: 10, activity: 'Quick quiz from KINETIX AI and summary' },
          ],
          materials: ['Textbook chapter 4', 'Board: worked example'],
          assessment: 'Exit question: pass the journal entry for one case.',
          homework: 'Exercise 4.2 questions 2 to 5',
        },
      });
      break;
    }
  }

  // Consent: Aarav (an adult student) answered for himself; Rajesh answered for Diya, who has no login.
  await db.insert(s.consents).values([
    { tenantId, studentId: byName('Aarav Patel').id, purpose: 'data_processing', granted: true, noticeVersion: '2026-10', givenBy: aaravUser.id },
    { tenantId, studentId: byName('Aarav Patel').id, purpose: 'ai_features', granted: true, noticeVersion: '2026-10', givenBy: aaravUser.id },
    { tenantId, studentId: byName('Diya Patel').id, purpose: 'data_processing', granted: true, noticeVersion: '2026-10', givenBy: rajesh.id },
  ]);

  // Aarav handed in the forfeiture notes; Anita checked them.
  const [notesHw] = await db.select().from(s.homework).where(eq(s.homework.title, 'Forfeiture of shares: notes'));
  await db.insert(s.homeworkSubmissions).values({
    tenantId,
    homeworkId: notesHw.id,
    studentId: byName('Aarav Patel').id,
    text: 'Forfeiture is the cancellation of shares when a shareholder fails to pay calls. Share capital is debited with the called-up amount, calls in arrears credited, and the amount received credited to Share Forfeiture account.',
    status: 'checked',
    submittedBy: aaravUser.id,
    submittedAt: new Date(today.getTime() - 4 * 86400_000),
    remark: 'Good summary. Add a journal entry example next time.',
    checkedBy: anita.id,
    checkedAt: new Date(today.getTime() - 2 * 86400_000),
  });

  // The notifications those events would have produced, so the parent inbox is not empty.
  const guardianLinks = await db.select().from(s.guardians).where(eq(s.guardians.tenantId, tenantId));
  const recentAbsences = await db
    .select({ studentId: s.attendanceRecords.studentId, date: s.attendanceRecords.date, slotId: s.attendanceRecords.timetableSlotId, at: s.attendanceRecords.occurredAt })
    .from(s.attendanceRecords)
    .where(eq(s.attendanceRecords.status, 'absent'));
  for (const g of guardianLinks) {
    const kid = allStudents.find((x) => x.id === g.studentId)!;
    for (const a of recentAbsences.filter((x) => x.studentId === g.studentId).slice(-3)) {
      const slot = slots.find((x) => x.id === a.slotId)!;
      const subject = [corpAcc, costing, dmaths].find((x) => x.id === slot.subjectId)!;
      await db.insert(s.notifications).values({
        tenantId,
        userId: g.userId,
        kind: 'absence',
        title: `${kid.fullName.split(' ')[0]} was marked absent`,
        body: `${kid.fullName} was marked absent for ${subject.name} (${slot.startsAt.slice(0, 5)}–${slot.endsAt.slice(0, 5)}) on ${shortDate(a.date)}. If this is wrong, please contact the class teacher.`,
        data: { studentId: kid.id, date: a.date, slotId: slot.id },
        dedupeKey: `absence:${kid.id}:${a.date}:${slot.id}`,
        createdAt: a.at,
        readAt: a.date < inDays(-4) ? a.at : null,
      });
    }
  }
  const hwRows = await db.select().from(s.homework).where(eq(s.homework.tenantId, tenantId));
  for (const hw of hwRows.filter((h) => h.dueOn >= inDays(0))) {
    const subject = [corpAcc, costing, dmaths].find((x) => x.id === hw.subjectId)!;
    for (const g of guardianLinks.filter((g) => allStudents.find((x) => x.id === g.studentId)!.sectionId === hw.sectionId)) {
      await db
        .insert(s.notifications)
        .values({
          tenantId,
          userId: g.userId,
          kind: 'homework',
          title: `Homework: ${subject.name}`,
          body: `${hw.title} · due ${shortDate(hw.dueOn)}`,
          data: { homeworkId: hw.id, sectionId: hw.sectionId },
          dedupeKey: `homework:${hw.id}`,
        })
        .onConflictDoNothing();
    }
  }

  const code = enrollmentCode();
  await db.insert(s.devices).values({
    tenantId,
    campusId: campus.id,
    roomId: room.id,
    name: 'Room 204 Board',
    enrollmentCodeHash: hmac(env.PAIRING_HMAC_SECRET, `enroll:${code}`),
    enrollmentExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
  });

  console.log(`
Seeded tenant "demo-college".
  Staff logins (password "${PASSWORD}"):
    principal@demo.kinetix.in   (principal: can circulate messages)
    admin@demo.kinetix.in       (tenant admin)
    accounts@demo.kinetix.in    (accountant: fees)
    library@demo.kinetix.in     (librarian)
    anita@demo.kinetix.in       (teacher, BCom Sem 3 A)
    ravi@demo.kinetix.in        (teacher, BCA Sem 1 A; head of Commerce)
  Parent logins (same password):
    parent@demo.kinetix.in      (Rajesh Patel: Aarav, BCom Sem 3 A, and Diya, BCA Sem 1 A)
    sunita@demo.kinetix.in      (Sunita Gowda: Ananya, BCom Sem 3 A)
  Student login (same password):
    aarav@demo.kinetix.in       (Aarav Patel, BCom Sem 3 A)
  Board enrolment code for "Room 204 Board": ${code}
  Content library: ${library.courses} courses, ${library.topics} topics with notes
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
