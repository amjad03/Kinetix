/**
 * Adds, removes or lists members of the KINETIX platform team (platform_admins), who look after
 * the global library for every institution (concept videos in the ERP's Platform area). A member
 * is an existing user, usually of KINETIX's own institution, found by email or mobile number.
 * Runs as the owner role (DATABASE_URL): the app role cannot touch platform_admins.
 *
 *   node dist/db/platform-admin.js add --tenant kinetix --login meera@kinetix.in [--note "Curriculum team"]
 *   node dist/db/platform-admin.js remove --tenant kinetix --login meera@kinetix.in
 *   node dist/db/platform-admin.js list
 *
 * (Docker: `kinetix-api platform-admin add …`.) The change takes effect at the next request.
 */
import { and, asc, eq, or } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { normalizePhone } from '../auth/phone.js';
import * as s from './schema.js';

export class UsageError extends Error {}
export class NotFoundError extends Error {}

export type PlatformAdminArgs = { command: 'list' } | { command: 'add' | 'remove'; tenant: string; login: string; note: string | null };

export function parseArgs(argv: string[]): PlatformAdminArgs {
  const [command, ...rest] = argv;
  if (command === 'list') {
    if (rest.length) throw new UsageError(`Unknown argument: ${rest[0]}`);
    return { command };
  }
  if (command !== 'add' && command !== 'remove') throw new UsageError('Say add, remove or list');
  const v: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = rest[i].startsWith('--') ? rest[i].slice(2).split(/=(.*)/s, 2) : [undefined, undefined];
    if (!flag || !['tenant', 'login', 'note'].includes(flag)) throw new UsageError(`Unknown argument: ${rest[i]}`);
    const value = inline ?? rest[++i];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`--${flag} needs a value`);
    v[flag] = value.trim();
  }
  if (!v.tenant) throw new UsageError('--tenant (the institution slug) is required');
  if (!v.login) throw new UsageError('--login (email or mobile number) is required');
  return { command, tenant: v.tenant, login: v.login, note: v.note || null };
}

async function findUser(db: NodePgDatabase<typeof s>, tenant: string, login: string) {
  const email = login.toLowerCase();
  const phone = normalizePhone(login);
  const [u] = await db
    .select({ id: s.users.id, fullName: s.users.fullName, email: s.users.email, phone: s.users.phone })
    .from(s.users)
    .innerJoin(s.tenants, eq(s.tenants.id, s.users.tenantId))
    .where(and(eq(s.tenants.slug, tenant), or(eq(s.users.email, email), eq(s.users.phone, phone))));
  if (!u) throw new NotFoundError(`No user "${login}" in institution "${tenant}". Create the account first (for KINETIX staff: in KINETIX's own institution).`);
  return u;
}

export async function addPlatformAdmin(db: NodePgDatabase<typeof s>, tenant: string, login: string, note: string | null = null) {
  const u = await findUser(db, tenant, login);
  await db.insert(s.platformAdmins).values({ userId: u.id, note }).onConflictDoUpdate({ target: s.platformAdmins.userId, set: { note } });
  return u;
}

export async function removePlatformAdmin(db: NodePgDatabase<typeof s>, tenant: string, login: string) {
  const u = await findUser(db, tenant, login);
  const gone = await db.delete(s.platformAdmins).where(eq(s.platformAdmins.userId, u.id)).returning();
  return { user: u, removed: gone.length > 0 };
}

export function listPlatformAdmins(db: NodePgDatabase<typeof s>) {
  return db
    .select({ fullName: s.users.fullName, email: s.users.email, phone: s.users.phone, tenant: s.tenants.slug, note: s.platformAdmins.note, since: s.platformAdmins.createdAt })
    .from(s.platformAdmins)
    .innerJoin(s.users, eq(s.users.id, s.platformAdmins.userId))
    .innerJoin(s.tenants, eq(s.tenants.id, s.users.tenantId))
    .orderBy(asc(s.users.fullName));
}

async function main() {
  let args: PlatformAdminArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`${e.message}\n\nUsage: platform-admin add|remove --tenant <slug> --login <email or mobile> [--note <text>]\n       platform-admin list`);
    process.exitCode = 2;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (the owner role) is not set');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema: s });
  const who = (u: { fullName: string; email: string | null; phone: string | null }) => `${u.fullName} <${u.email ?? u.phone}>`;
  try {
    if (args.command === 'list') {
      const rows = await listPlatformAdmins(db);
      if (!rows.length) console.log('The platform team is empty.');
      for (const r of rows) console.log(`${who(r)}  (${r.tenant})${r.note ? `  ${r.note}` : ''}  since ${r.since.toISOString().slice(0, 10)}`);
    } else if (args.command === 'add') {
      console.log(`${who(await addPlatformAdmin(db, args.tenant, args.login, args.note))} is on the KINETIX platform team. They see Platform in the ERP after signing in again.`);
    } else {
      const r = await removePlatformAdmin(db, args.tenant, args.login);
      console.log(r.removed ? `${who(r.user)} is no longer on the platform team.` : `${who(r.user)} was not on the platform team.`);
    }
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
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
