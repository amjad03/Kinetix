import { execSync } from 'node:child_process';
import { runMigrations } from '../src/db/migrate.js';

export const TEST_DB = 'kinetix_test';

/** Recreates the test database and applies migrations once per test run. */
export default async function setup() {
  const owner = `postgres://kinetix_owner:kinetix_owner@localhost:5432/${TEST_DB}`;
  const psql = (sql: string) => execSync(`sudo -u postgres psql -q -c "${sql}"`, { stdio: 'pipe' });
  psql(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  psql(`CREATE DATABASE ${TEST_DB} OWNER kinetix_owner`);
  await runMigrations(owner);
}
