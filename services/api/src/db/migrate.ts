// Applies SQL migrations as the owner role. Usage: pnpm db:migrate
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export async function runMigrations(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: new URL('../../migrations', import.meta.url).pathname });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  await runMigrations(url);
  console.log('Migrations applied.');
  await sealStaffIdentifiers(url);
}

/**
 * Staff PAN and UAN kept in clear before migration 0198 are encrypted now, as the owner role (every institution). The
 * built image (dist) runs it; the TypeScript dev runner cannot load the app's modules, so it says to run the rotation job.
 */
async function sealStaffIdentifiers(url: string) {
  let reseal: typeof import('../hr/staff-ids.js').resealStaffIds;
  try {
    ({ resealStaffIds: reseal } = await import('../hr/staff-ids.js'));
  } catch {
    console.log('Staff PAN/UAN not sealed by this runner: run `pnpm secrets:rotate` to encrypt any kept in clear.');
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const r = await reseal(drizzle(pool));
    if (r.rotated || r.failed) console.log(`Staff PAN/UAN: ${r.rotated} of ${r.rows} records encrypted${r.failed ? `; ${r.failed} could not be read` : ''}.`);
  } finally {
    await pool.end();
  }
}
