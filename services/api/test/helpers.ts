import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { RealtimeEvents, type PairingClaimedEvent } from '@kinetix/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup.js';
import { Clock, zonedToInstant } from '../src/common/time.js';
import { enrollmentCode, hmac } from '../src/common/crypto.js';
import * as s from '../src/db/schema.js';

const TEST_DB = process.env.KINETIX_TEST_DB || 'kinetix_test';

export const env = {
  DATABASE_URL: `postgres://kinetix_owner:kinetix_owner@localhost:5432/${TEST_DB}`,
  APP_DATABASE_URL: `postgres://kinetix_app:kinetix_app@localhost:5432/${TEST_DB}`,
  JWT_SECRET: 'test-secret-test-secret',
  PAIRING_HMAC_SECRET: 'pairing-test-secret',
  PORT: '0',
  JOBS_POLL_MS: '0',
  STORAGE_DIR: `/tmp/kinetix-test-objects-${process.pid}`,
  /** Encrypts institutions' payment secrets in tests (32 bytes, base64; not a real key). */
  SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};
Object.assign(process.env, env);

export class FixedClock extends Clock {
  constructor(public at: Date) {
    super();
  }
  now(): Date {
    return this.at;
  }
}

/** The coming Monday at the given IST time, so pinned times are always in the future. */
export function nextMondayIst(time: string): Date {
  const d = new Date();
  const istNow = new Date(d.getTime() + 5.5 * 3600_000);
  const daysAhead = ((8 - (istNow.getUTCDay() || 7)) % 7) || 7;
  const monday = new Date(istNow.getTime() + daysAhead * 86400_000).toISOString().slice(0, 10);
  return zonedToInstant(monday, `${time}:00`, 'Asia/Kolkata');
}

export async function createApp(clock: FixedClock, customize: (b: TestingModuleBuilder) => TestingModuleBuilder = (b) => b): Promise<INestApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Clock).useValue(clock)).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  await app.init();
  await app.listen(0);
  return app;
}

export const ownerPool = () => new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });

let counter = 0;

/**
 * A complete tenant: campus, BCom Sem 3 A with 3 students, a teacher with a Monday
 * 10:00–10:55 slot in Room 1, a principal, a student user, and an un-enrolled board.
 */
export async function createTenant(pool: pg.Pool) {
  const db = drizzle(pool, { schema: s });
  const n = ++counter;
  const slug = `t${n}-${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await argon2.hash('pw');

  const [tenant] = await db.insert(s.tenants).values({ slug, name: `Tenant ${n}`, kind: 'college' }).returning();
  const tenantId = tenant.id;
  const [campus] = await db.insert(s.campuses).values({ tenantId, name: 'Main' }).returning();
  const [year] = await db.insert(s.academicYears).values({ tenantId, label: '2026-27', startsOn: '2026-08-01', endsOn: '2027-05-31', isCurrent: true }).returning();
  const [program] = await db.insert(s.programs).values({ tenantId, campusId: campus.id, name: 'BCom', level: 'ug', termCount: 6 }).returning();
  const [section] = await db.insert(s.sections).values({ tenantId, programId: program.id, academicYearId: year.id, term: 3, name: 'A', displayName: 'BCom Sem 3 A' }).returning();
  const [otherSection] = await db.insert(s.sections).values({ tenantId, programId: program.id, academicYearId: year.id, term: 3, name: 'B', displayName: 'BCom Sem 3 B' }).returning();
  const [subject] = await db.insert(s.subjects).values({ tenantId, programId: program.id, term: 3, code: 'BCOM-3.1', name: 'Corporate Accounting' }).returning();
  const studentRows = await db
    .insert(s.students)
    .values(['A', 'B', 'C'].map((x, i) => ({ tenantId, sectionId: section.id, rollNo: `R${i + 1}`, fullName: `Student ${x}` })))
    .returning();
  const [room] = await db.insert(s.rooms).values({ tenantId, campusId: campus.id, name: 'Room 1' }).returning();

  const user = async (email: string, role: (typeof s.roleName.enumValues)[number]) => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName: email.split('@')[0], email, passwordHash }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId: campus.id });
    return u;
  };
  const teacher = await user(`teacher${n}@x.in`, 'teacher');
  const teacher2 = await user(`teacher2-${n}@x.in`, 'teacher');
  const principal = await user(`principal${n}@x.in`, 'principal');
  const studentUser = await user(`student${n}@x.in`, 'student');

  // Families: a guardian for each of the first two students; student C has their own login.
  const guardian = await user(`parent${n}@x.in`, 'guardian');
  const guardian2 = await user(`parent2-${n}@x.in`, 'guardian');
  await db.insert(s.guardians).values([
    { tenantId, userId: guardian.id, studentId: studentRows[0].id, relation: 'father' },
    { tenantId, userId: guardian2.id, studentId: studentRows[1].id, relation: 'mother' },
  ]);
  await db.update(s.students).set({ userId: studentUser.id }).where(eq(s.students.id, studentRows[2].id));

  const [slot] = await db
    .insert(s.timetableSlots)
    .values({ tenantId, academicYearId: year.id, sectionId: section.id, subjectId: subject.id, teacherId: teacher.id, roomId: room.id, dayOfWeek: 1, startsAt: '10:00', endsAt: '10:55' })
    .returning();

  const code = enrollmentCode();
  const [device] = await db
    .insert(s.devices)
    .values({
      tenantId,
      campusId: campus.id,
      roomId: room.id,
      name: 'Room 1 Board',
      enrollmentCodeHash: hmac(env.PAIRING_HMAC_SECRET, `enroll:${code}`),
      enrollmentExpiresAt: new Date(Date.now() + 365 * 86400_000),
    })
    .returning();

  return { slug, tenantId, campus, program, section, otherSection, subject, students: studentRows, room, teacher, teacher2, principal, studentUser, guardian, guardian2, slot, device, enrollmentCode: code };
}

/**
 * Enrols the tenant's board, opens its realtime socket and pairs the teacher to it (the
 * teacher's Monday 10:00 class is open when the clock is inside that period).
 */
export async function pairBoard(app: INestApplication, t: { enrollmentCode: string }, teacherToken: string): Promise<{ boardToken: string; deviceToken: string; socket: Socket }> {
  const http = () => request(app.getHttpServer());
  const deviceToken = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(201)).body.deviceToken as string;
  const url = (await app.getUrl()).replace('[::1]', 'localhost');
  const socket = io(`${url}/realtime`, { auth: { token: deviceToken }, transports: ['websocket'] });
  await new Promise((r) => socket.once('ready', r));
  const { code } = (await http().post('/v1/devices/me/pairing-codes').set('authorization', `Bearer ${deviceToken}`).expect(201)).body;
  const claimed = new Promise<PairingClaimedEvent>((r) => socket.once(RealtimeEvents.PairingClaimed, r));
  await http().post('/v1/pairing/claim').set('authorization', `Bearer ${teacherToken}`).send({ code }).expect(200);
  return { boardToken: (await claimed).sessionToken, deviceToken, socket };
}
