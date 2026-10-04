/**
 * Demo data: a Bangalore University–affiliated UG/PG college with one board.
 * Usage: pnpm db:seed   (prints the board enrolment code and staff logins)
 */
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { enrollmentCode, hmac } from '../common/crypto.js';
import { importContent } from '../content/import.js';
import { shortDate } from '../notifications/notifications.service.js';
import { loadEnv } from '../config/env.js';
import * as s from './schema.js';
const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema: s });
const PASSWORD = 'kinetix123';
async function main() {
    const existing = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.slug, 'demo-college') });
    if (existing) {
        console.log('Demo tenant already exists. Drop the database to reseed.');
        return;
    }
    const hash = await argon2.hash(PASSWORD);
    const library = await importContent(db);
    const course = async (code) => (await db.query.courses.findFirst({ where: (c, { eq }) => eq(c.code, code) }))?.id ?? null;
    const [tenant] = await db
        .insert(s.tenants)
        .values({ slug: 'demo-college', name: 'KINETIX Demo College of Commerce & Science', kind: 'college', settings: { liveViewEnabled: true, liveViewIndicator: true } })
        .returning();
    const tenantId = tenant.id;
    const [campus] = await db.insert(s.campuses).values({ tenantId, name: 'Main Campus', city: 'Bengaluru' }).returning();
    const [year] = await db.insert(s.academicYears).values({ tenantId, label: '2026-27', startsOn: '2026-08-01', endsOn: '2027-05-31', isCurrent: true }).returning();
    const [bcom] = await db.insert(s.programs).values({ tenantId, campusId: campus.id, name: 'BCom', level: 'ug', curriculumCode: 'bu-ug', termCount: 6 }).returning();
    const [bca] = await db.insert(s.programs).values({ tenantId, campusId: campus.id, name: 'BCA', level: 'ug', curriculumCode: 'bu-ug', termCount: 6 }).returning();
    const [mcom] = await db.insert(s.programs).values({ tenantId, campusId: campus.id, name: 'MCom', level: 'pg', curriculumCode: 'bu-pg', termCount: 4 }).returning();
    const [bcom3a] = await db.insert(s.sections).values({ tenantId, programId: bcom.id, academicYearId: year.id, term: 3, name: 'A', displayName: 'BCom Sem 3 A' }).returning();
    const [bca1a] = await db.insert(s.sections).values({ tenantId, programId: bca.id, academicYearId: year.id, term: 1, name: 'A', displayName: 'BCA Sem 1 A' }).returning();
    await db.insert(s.sections).values({ tenantId, programId: mcom.id, academicYearId: year.id, term: 1, name: 'A', displayName: 'MCom Sem 1 A' });
    const [corpAcc] = await db.insert(s.subjects).values({ tenantId, programId: bcom.id, term: 3, code: 'BCOM-3.1', name: 'Corporate Accounting', courseId: await course('bcom-3-corporate-accounting') }).returning();
    const [costing] = await db.insert(s.subjects).values({ tenantId, programId: bcom.id, term: 3, code: 'BCOM-3.3', name: 'Cost Accounting', courseId: await course('bcom-3-cost-accounting') }).returning();
    const [dmaths] = await db.insert(s.subjects).values({ tenantId, programId: bca.id, term: 1, code: 'BCA-1.2', name: 'Discrete Mathematics', courseId: await course('bca-1-discrete-mathematics') }).returning();
    const staff = async (fullName, email, roles, lang = 'en') => {
        const [u] = await db.insert(s.users).values({ tenantId, fullName, email, passwordHash: hash, preferredLanguage: lang }).returning();
        for (const role of roles)
            await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId: campus.id });
        return u;
    };
    await staff('Dr. Meera Rao', 'principal@demo.kinetix.in', ['principal']);
    const admin = await staff('Admin Office', 'admin@demo.kinetix.in', ['tenant_admin']);
    await staff('Accounts Office', 'accounts@demo.kinetix.in', ['accountant']);
    const anita = await staff('Anita Sharma', 'anita@demo.kinetix.in', ['teacher'], 'hi');
    const ravi = await staff('Ravi Kumar', 'ravi@demo.kinetix.in', ['teacher', 'hod'], 'kn');
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
    const byName = (n) => allStudents.find((x) => x.fullName === n);
    const parent = async (fullName, email, phone, kids) => {
        const [u] = await db.insert(s.users).values({ tenantId, fullName, email, phone, passwordHash: hash }).returning();
        await db.insert(s.userRoles).values({ tenantId, userId: u.id, role: 'guardian', campusId: campus.id });
        for (const [kid, relation] of kids)
            await db.insert(s.guardians).values({ tenantId, userId: u.id, studentId: byName(kid).id, relation });
    };
    await parent('Rajesh Patel', 'parent@demo.kinetix.in', '+919800000001', [['Aarav Patel', 'father'], ['Diya Patel', 'father']]);
    await parent('Sunita Gowda', 'sunita@demo.kinetix.in', '+919800000002', [['Ananya Gowda', 'mother']]);
    // Fees: Semester tuition for both classes. Sunita has paid Ananya's at the counter.
    const issueFee = async (sectionId, title, amountPaise, dueInDays) => {
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
    const ananyaFee = bcomFees.find((f) => f.studentId === byName('Ananya Gowda').id);
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
                    outcome: ['correct', 'correct', 'partial', 'incorrect', 'correct'][(back * 3 + klass.indexOf(st) * 2 + j) % 5],
                    recordedBy: slot.teacherId,
                    occurredAt: new Date(`${date}T${slot.startsAt}+05:30`),
                });
            }
        }
    }
    const inDays = (n) => new Date(today.getTime() + n * 86400_000).toISOString().slice(0, 10);
    await db.insert(s.homework).values([
        { tenantId, sectionId: bcom3a.id, subjectId: corpAcc.id, createdBy: anita.id, title: 'Exercise 4.2: Issue of shares', instructions: 'Solve questions 1 to 5 from the textbook. Show journal entries for each.', dueOn: inDays(2) },
        { tenantId, sectionId: bcom3a.id, subjectId: costing.id, createdBy: anita.id, title: 'Cost sheet practice', instructions: 'Prepare a cost sheet for the case on page 112.', dueOn: inDays(5) },
        { tenantId, sectionId: bca1a.id, subjectId: dmaths.id, createdBy: ravi.id, title: 'Sets and relations: worksheet 3', instructions: 'All questions. Draw Venn diagrams where needed.', dueOn: inDays(3) },
        { tenantId, sectionId: bcom3a.id, subjectId: corpAcc.id, createdBy: anita.id, title: 'Forfeiture of shares: notes', instructions: 'Read chapter 4.3 and write a one-page summary.', dueOn: inDays(-3) },
    ]);
    // The notifications those events would have produced, so the parent inbox is not empty.
    const guardianLinks = await db.select().from(s.guardians).where(eq(s.guardians.tenantId, tenantId));
    const recentAbsences = await db
        .select({ studentId: s.attendanceRecords.studentId, date: s.attendanceRecords.date, slotId: s.attendanceRecords.timetableSlotId, at: s.attendanceRecords.occurredAt })
        .from(s.attendanceRecords)
        .where(eq(s.attendanceRecords.status, 'absent'));
    for (const g of guardianLinks) {
        const kid = allStudents.find((x) => x.id === g.studentId);
        for (const a of recentAbsences.filter((x) => x.studentId === g.studentId).slice(-3)) {
            const slot = slots.find((x) => x.id === a.slotId);
            const subject = [corpAcc, costing, dmaths].find((x) => x.id === slot.subjectId);
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
        const subject = [corpAcc, costing, dmaths].find((x) => x.id === hw.subjectId);
        for (const g of guardianLinks.filter((g) => allStudents.find((x) => x.id === g.studentId).sectionId === hw.sectionId)) {
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
    anita@demo.kinetix.in       (teacher, BCom Sem 3 A)
    ravi@demo.kinetix.in        (teacher + HOD, BCA Sem 1 A)
  Parent logins (same password):
    parent@demo.kinetix.in      (Rajesh Patel: Aarav, BCom Sem 3 A, and Diya, BCA Sem 1 A)
    sunita@demo.kinetix.in      (Sunita Gowda: Ananya, BCom Sem 3 A)
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
//# sourceMappingURL=seed.js.map