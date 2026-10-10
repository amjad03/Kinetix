/**
 * Second demo tenant: Soundarya Institute of Management and Science, Bengaluru (BCU affiliated, NEP scheme).
 * Usage: pnpm db:seed:soundarya   (run after the migrations; safe to run again: it replaces this tenant only)
 * Every module has data. Logins are written to docs/demo/SOUNDARYA_DEMO_LOGINS.md.
 */
import argon2 from 'argon2';
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { DOMAIN, LOGIN_STAFF, PASSWORD, SLUG, STAFF } from './soundarya/data.js';
import { buildCore } from './soundarya/core.js';
import { makeKit } from './soundarya/kit.js';
import { stages } from './soundarya/stages.js';
import { closeNest } from './soundarya/nest.js';

pg.types.setTypeParser(1082, (v: string) => v); // keep dates as 2026-09-01 strings
const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

/** Removes this tenant and everything it owns (other tenants are untouched). */
async function wipe(): Promise<void> {
  const found = await pool.query('select id from tenants where slug = $1', [SLUG]);
  if (found.rowCount === 0) return;
  const tenantId = found.rows[0].id as string;
  const tables = (await pool.query("select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id' and table_name <> 'tenants' order by 1")).rows.map((r) => r.table_name as string);
  let remaining = tables;
  for (let pass = 0; pass < 12 && remaining.length; pass++) {
    const next: string[] = [];
    for (const t of remaining) {
      try {
        await pool.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
      } catch {
        next.push(t);
      }
    }
    remaining = next;
  }
  if (remaining.length) throw new Error(`Could not clear: ${remaining.join(', ')}`);
  await pool.query('delete from tenants where id = $1', [tenantId]);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes') {
    console.error('Refusing to load demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=yes for a staging demo.');
    process.exitCode = 1;
    return;
  }
  const t0 = Date.now();
  await wipe();
  const hash = await argon2.hash(PASSWORD);
  const ctx = await buildCore(makeKit(pool, ''), hash);
  console.log(`Core: ${ctx.sections.length} classes, ${ctx.students.length} students, ${ctx.staff.length} staff (${Math.round((Date.now() - t0) / 1000)}s)`);
  for (const [name, run] of stages) {
    const t = Date.now();
    await run(ctx);
    console.log(`  ${name} (${Math.round((Date.now() - t) / 100) / 10}s)`);
  }
  const doc = loginsDoc(ctx.students.filter((s) => s.name === 'Sahana Gowda' || s.name === 'Vignesh Naik').map((s) => ({ name: s.name, roll: s.rollNo, sec: ctx.sections.find((x) => x.id === s.sectionId)!.label })));
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/demo/SOUNDARYA_DEMO_LOGINS.md');
  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, doc);
  } catch {
    /* running from a built image without the docs folder */
  }
  console.log(`\n${doc}\nDone in ${Math.round((Date.now() - t0) / 1000)}s.`);
}

function loginsDoc(studentRows: { name: string; roll: string; sec: string }[]): string {
  const staffRole = (prefix: string) => STAFF.find((s) => s.email === prefix)!;
  const lines = [
    '# Soundarya Institute of Management and Science: demo logins',
    '',
    `Institution code: \`${SLUG}\`. Password for every login: \`${PASSWORD}\` (demo data only; people and phone numbers are fictional).`,
    '',
    'Load or reload with `pnpm db:seed:soundarya` in `services/api` (replaces this institution only).',
    '',
    '| Role | Name | Login (email) |',
    '|---|---|---|',
    ...LOGIN_STAFF.map((p) => {
      const s = staffRole(p);
      const role = s.roles.includes('hod') ? `HoD, ${s.dept}` : s.roles[0].replace(/_/g, ' ');
      return `| ${role} | ${s.name} | ${p}@${DOMAIN} |`;
    }),
    ...studentRows.map((s) => `| student | ${s.name} (${s.roll}, ${s.sec}) | ${s.name === 'Sahana Gowda' ? 'student.bcom' : 'student.bca'}@${DOMAIN} |`),
    `| alumnus (alumni portal) | the first alumni profile | alumnus@${DOMAIN} |`,
    `| guardian | Basavaraj Gowda (father of Sahana Gowda) | parent.bcom@${DOMAIN} |`,
    `| guardian | Revathi Naik (mother of Vignesh Naik, BCA Sem 3, and Chaitra Naik, BBA Sem 1) | parent.bca@${DOMAIN} |`,
    '',
    'Other staff sign in with `<email prefix>@' + DOMAIN + '` (for example `admissions`, `placements`, `warden`, `transport`, `stores`, `grievance`, `research`).',
    '',
    'Institution: Soundarya Nagar, Sidedahalli, Nagasandra Post, Bengaluru 560073. Affiliated to Bengaluru City University, NEP semester scheme, academic year 2026-27.',
    '',
  ];
  return lines.join('\n');
}

/** Settles when the seed has finished (the tests await it). */
export const seeded = main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNest();
    await pool.end();
  });
