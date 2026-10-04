/**
 * Demo data: a Bangalore University–affiliated UG/PG college with one board.
 * Usage: pnpm db:seed   (prints the board enrolment code and staff logins)
 */
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { enrollmentCode, hmac } from '../common/crypto.js';
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

  const [corpAcc] = await db.insert(s.subjects).values({ tenantId, programId: bcom.id, term: 3, code: 'BCOM-3.1', name: 'Corporate Accounting' }).returning();
  const [costing] = await db.insert(s.subjects).values({ tenantId, programId: bcom.id, term: 3, code: 'BCOM-3.3', name: 'Cost Accounting' }).returning();
  const [dmaths] = await db.insert(s.subjects).values({ tenantId, programId: bca.id, term: 1, code: 'BCA-1.2', name: 'Discrete Mathematics' }).returning();

  const staff = async (fullName: string, email: string, roles: (typeof s.roleName.enumValues)[number][], lang: 'en' | 'hi' | 'kn' = 'en') => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName, email, passwordHash: hash, preferredLanguage: lang }).returning();
    for (const role of roles) await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId: campus.id });
    return u;
  };
  await staff('Dr. Meera Rao', 'principal@demo.kinetix.in', ['principal']);
  await staff('Admin Office', 'admin@demo.kinetix.in', ['tenant_admin']);
  const anita = await staff('Anita Sharma', 'anita@demo.kinetix.in', ['teacher'], 'hi');
  const ravi = await staff('Ravi Kumar', 'ravi@demo.kinetix.in', ['teacher', 'hod'], 'kn');

  const names = ['Aarav Patel', 'Ananya Gowda', 'Bhavya Reddy', 'Chetan Naik', 'Deepika Hegde', 'Farhan Khan', 'Gauri Shetty', 'Harsh Jain', 'Ishita Rao', 'Karthik Murthy', 'Lakshmi Iyer', 'Manoj Bhat'];
  await db.insert(s.students).values(names.map((fullName, i) => ({ tenantId, sectionId: bcom3a.id, rollNo: `U03BC${(i + 1).toString().padStart(3, '0')}`, fullName })));
  await db.insert(s.students).values(names.slice(0, 8).map((fullName, i) => ({ tenantId, sectionId: bca1a.id, rollNo: `U01CA${(i + 1).toString().padStart(3, '0')}`, fullName })));

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
    anita@demo.kinetix.in       (teacher, BCom Sem 3 A)
    ravi@demo.kinetix.in        (teacher + HOD, BCA Sem 1 A)
  Board enrolment code for "Room 204 Board": ${code}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
