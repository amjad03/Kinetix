/**
 * Creates a real institution: the tenant (default settings), its first campus, the current
 * academic year and the first administrator (tenant_admin). Everything else is then loaded from
 * the ERP (Import: programs, staff, students, timetable). Runs as the owner role (DATABASE_URL),
 * because the app role may not create tenants. Refuses a slug that already exists.
 *
 *   node dist/db/create-institution.js --slug sjc-blr --name "St. Joseph's College" --kind college \
 *     --timezone Asia/Kolkata --campus "Main Campus" --city Bengaluru \
 *     --year-label 2026-27 --year-start 2026-06-01 --year-end 2027-03-31 \
 *     --admin-name "Admin Office" --admin-email office@sjc.example.in [--admin-phone 98450 12345] [--otp-only]
 *
 * (Docker: `kinetix-api create-institution --slug …`.) The administrator's temporary password is
 * printed once and never stored in clear; with --otp-only there is no password and the
 * administrator signs in with a code sent to --admin-phone.
 */
import { randomInt } from 'node:crypto';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { normalizePhone } from '../auth/phone.js';
import * as s from './schema.js';

export interface InstitutionArgs {
  slug: string;
  name: string;
  kind: 'school' | 'college' | 'university';
  timezone: string;
  campus: string;
  city: string | null;
  yearLabel: string;
  yearStart: string;
  yearEnd: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string | null;
  otpOnly: boolean;
}

export class UsageError extends Error {}

/** The settings a new institution starts with: the same values the API assumes when one is unset. */
export const DEFAULT_SETTINGS: s.TenantSettings = { liveViewEnabled: false, liveViewIndicator: true, classroomAudioToViewers: false, pinFallbackEnabled: false, grievanceOfficer: null };

const FLAGS = ['slug', 'name', 'kind', 'timezone', 'campus', 'city', 'year-label', 'year-start', 'year-end', 'admin-name', 'admin-email', 'admin-phone'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv: string[]): InstitutionArgs {
  const v: Record<string, string> = {};
  let otpOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--otp-only') {
      otpOnly = true;
      continue;
    }
    const [flag, inline] = a.startsWith('--') ? a.slice(2).split(/=(.*)/s, 2) : [undefined, undefined];
    if (!flag || !(FLAGS as readonly string[]).includes(flag)) throw new UsageError(`Unknown argument: ${a}`);
    const value = inline ?? argv[++i];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`--${flag} needs a value`);
    v[flag] = value.trim();
  }
  for (const f of ['slug', 'name', 'kind', 'year-label', 'year-start', 'year-end', 'admin-name', 'admin-email']) if (!v[f]) throw new UsageError(`--${f} is required`);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(v.slug)) throw new UsageError('--slug: lower-case letters, digits and hyphens, e.g. sjc-blr');
  if (!['school', 'college', 'university'].includes(v.kind)) throw new UsageError('--kind must be school, college or university');
  const timezone = v.timezone || 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new UsageError(`--timezone: unknown time zone ${timezone}`);
  }
  for (const f of ['year-start', 'year-end']) if (!DATE.test(v[f]) || Number.isNaN(Date.parse(v[f]))) throw new UsageError(`--${f} must be a date like 2026-06-01`);
  if (v['year-end'] <= v['year-start']) throw new UsageError('--year-end must be after --year-start');
  const adminEmail = v['admin-email'].toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new UsageError('--admin-email is not an email address');
  const adminPhone = v['admin-phone'] ? normalizePhone(v['admin-phone']) : null;
  if (adminPhone && !/^\+\d{8,15}$/.test(adminPhone)) throw new UsageError('--admin-phone is not a mobile number');
  if (otpOnly && !adminPhone) throw new UsageError('--otp-only needs --admin-phone (the administrator signs in with a code sent to it)');
  return {
    slug: v.slug,
    name: v.name,
    kind: v.kind as InstitutionArgs['kind'],
    timezone,
    campus: v.campus || 'Main Campus',
    city: v.city || null,
    yearLabel: v['year-label'],
    yearStart: v['year-start'],
    yearEnd: v['year-end'],
    adminName: v['admin-name'],
    adminEmail,
    adminPhone,
    otpOnly,
  };
}

/** A temporary password: 14 characters without look-alikes (0/O, 1/l/I). */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export class SlugTakenError extends Error {}

/** Creates the institution in one transaction (owner role). Returns the tenant and the one-time password (null with otpOnly). */
export async function createInstitution(db: NodePgDatabase<typeof s>, a: InstitutionArgs) {
  const password = a.otpOnly ? null : temporaryPassword();
  const passwordHash = password ? await argon2.hash(password) : null;
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: s.tenants.id }).from(s.tenants).where(eq(s.tenants.slug, a.slug));
    if (taken) throw new SlugTakenError(`An institution with the slug "${a.slug}" already exists. Nothing was changed.`);
    const [tenant] = await tx.insert(s.tenants).values({ slug: a.slug, name: a.name, kind: a.kind, timezone: a.timezone, settings: DEFAULT_SETTINGS }).returning();
    const tenantId = tenant.id;
    const [campus] = await tx.insert(s.campuses).values({ tenantId, name: a.campus, city: a.city }).returning();
    const [year] = await tx.insert(s.academicYears).values({ tenantId, label: a.yearLabel, startsOn: a.yearStart, endsOn: a.yearEnd, isCurrent: true }).returning();
    const [admin] = await tx.insert(s.users).values({ tenantId, fullName: a.adminName, email: a.adminEmail, phone: a.adminPhone, passwordHash }).returning();
    await tx.insert(s.userRoles).values({ tenantId, userId: admin.id, role: 'tenant_admin', campusId: null });
    await tx.insert(s.auditLog).values({ tenantId, actorType: 'system', action: 'institution.created', subjectType: 'tenant', subjectId: tenantId, data: { slug: a.slug, adminUserId: admin.id, otpOnly: a.otpOnly } });
    return { tenant, campus, year, admin, password };
  });
}

async function main() {
  let args: InstitutionArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`${e.message}\n\nUsage: create-institution --slug <slug> --name <name> --kind school|college|university [--timezone Asia/Kolkata] [--campus "Main Campus"] [--city <city>] --year-label 2026-27 --year-start 2026-06-01 --year-end 2027-03-31 --admin-name <name> --admin-email <email> [--admin-phone <mobile>] [--otp-only]`);
    process.exitCode = 2;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (the owner role) is not set');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const r = await createInstitution(drizzle(pool, { schema: s }), args);
    console.log(`
Created "${r.tenant.name}" (${r.tenant.kind}), slug "${r.tenant.slug}", time zone ${r.tenant.timezone}.
  Campus: ${r.campus.name}${r.campus.city ? `, ${r.campus.city}` : ''}
  Academic year: ${r.year.label} (${r.year.startsOn} to ${r.year.endsOn}), current
  Administrator: ${r.admin.fullName} <${r.admin.email}>${r.admin.phone ? `, ${r.admin.phone}` : ''} (tenant_admin)
${
  r.password
    ? `  Temporary password (shown only this once; give it to the administrator in person or by phone):
      ${r.password}`
    : `  No password: the administrator signs in with a code sent to ${r.admin.phone}.`
}
Next: sign in to the ERP with institution "${r.tenant.slug}", then Import programs, staff, students and the timetable.`);
  } catch (e) {
    if (!(e instanceof SlugTakenError)) throw e;
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
