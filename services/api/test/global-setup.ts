import { execFileSync, execSync } from 'node:child_process';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { importContent } from '../src/content/import.js';
import { runMigrations } from '../src/db/migrate.js';
import * as schema from '../src/db/schema.js';

/** KINETIX_TEST_DB lets two checkouts run the suite at once without dropping each other's database. */
export const TEST_DB = process.env.KINETIX_TEST_DB || 'kinetix_test';

/** Recreates the test database and applies migrations once per test run. */
export default async function setup() {
  const owner = `postgres://kinetix_owner:kinetix_owner@localhost:5432/${TEST_DB}`;
  // KINETIX_PG_ADMIN_URL (e.g. postgres://me@localhost:5432/postgres) is a superuser connection that
  // needs no sudo; without it the old `sudo -u postgres psql` is used.
  const adminUrl = process.env.KINETIX_PG_ADMIN_URL;
  const psql = (sql: string) => (adminUrl ? execFileSync('psql', [adminUrl, '-q', '-c', sql], { stdio: 'pipe' }) : execSync(`sudo -u postgres psql -q -c "${sql}"`, { stdio: 'pipe' }));
  psql(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  psql(`CREATE DATABASE ${TEST_DB} OWNER kinetix_owner`);
  await runMigrations(owner);
  const pool = new pg.Pool({ connectionString: owner, max: 1 });
  await importContent(drizzle(pool, { schema }));
  await pool.end();
}
