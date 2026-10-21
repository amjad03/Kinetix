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
import { DOMAIN, INST, LOGIN_STAFF, PASSWORD, PROFILE, PROGRAMS, SCHOOL_DEPT_NAMES, SLUG, STAFF } from './soundarya/data.js';
import type { Ctx } from './soundarya/ctx.js';
import { buildCore } from './soundarya/core.js';
import { makeKit, setReadPool, wipeTenant } from './soundarya/kit.js';
import { stages } from './soundarya/stages.js';
import { schoolLife } from './soundarya/school.js';
import { closeNest } from './soundarya/nest.js';

pg.types.setTypeParser(1082, (v: string) => v); // keep dates as 2026-09-01 strings
const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
// The school seed reads through the app role so it never picks up another institution's rows.
const readPool = PROFILE === 'school' && env.APP_DATABASE_URL ? new pg.Pool({ connectionString: env.APP_DATABASE_URL }) : null;
setReadPool(readPool);

/** Removes this tenant and everything it owns (other tenants are untouched). */
const wipe = () => wipeTenant(pool, SLUG);

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
  if (PROFILE === 'school') aliasCollegeProgrammes(ctx);
  console.log(`Core: ${ctx.sections.length} classes, ${ctx.students.length} students, ${ctx.staff.length} staff (${Math.round((Date.now() - t0) / 1000)}s)`);
  const skipped: string[] = [];
  const all: typeof stages = PROFILE === 'school' ? [...stages, ['houses, class diary and Term 1 report cards', schoolLife]] : stages;
  for (const [name, run] of all) {
    const t = Date.now();
    try {
      await run(ctx);
    } catch (e) {
      // The stages were written for the college; a school skips the few that assume college programmes.
      if (PROFILE !== 'school') throw e;
      skipped.push(name);
      console.log(`  skipped: ${name}: ${(e as Error).message.slice(0, 160)} ${((e as Error).stack ?? "").split("\n")[1]?.trim()}`);
      continue;
    }
    console.log(`  ${name} (${Math.round((Date.now() - t) / 100) / 10}s)`);
  }
  if (PROFILE === 'school') {
    for (const [from, to] of Object.entries(SCHOOL_DEPT_NAMES)) await pool.query('update departments set name = $1 where tenant_id = $2 and name = $3', [to, ctx.tenantId, from]);
    // Admissions records were written for college programmes: give them school class names.
    const fix = (col: string) => `replace(replace(replace(replace(${col}, ' (KMAT / PGCET)', ''), 'MBA ', 'Class 11 Science '), 'BCA ', 'Class 6 '), 'BBA ', 'Class 1 ')`;
    await pool.query(`update admission_cycles set name = ${fix('name')} where tenant_id = $1`, [ctx.tenantId]);
    await pool.query(`update calendar_events set title = ${fix('title')} where tenant_id = $1`, [ctx.tenantId]);
    await pool.query(`update entrance_tests set name = 'Vidya Niketan Entrance Assessment (Class 1, 2027)' where tenant_id = $1`, [ctx.tenantId]);
    if (skipped.length) console.log(`Skipped ${skipped.length} college-only stages.`);
  }
  const doc = loginsDoc(ctx.students.filter((s) => s.name === INST.strong.name || s.name === INST.weak.name).map((s) => ({ name: s.name, roll: s.rollNo, sec: ctx.sections.find((x) => x.id === s.sectionId)!.label })));
  const out = resolve(dirname(fileURLToPath(import.meta.url)), `../../../../docs/demo/${PROFILE === 'school' ? 'SCHOOL' : 'SOUNDARYA'}_DEMO_LOGINS.md`);
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
    `# ${INST.name}: demo logins`,
    '',
    `Institution code: \`${SLUG}\`. Password for every login: \`${PASSWORD}\` (demo data only; people and phone numbers are fictional).`,
    '',
    `Load or reload with \`pnpm db:seed:${PROFILE === 'school' ? 'school' : 'soundarya'}\` in \`services/api\` (replaces this institution only).`,
    '',
    '| Role | Name | Login (email) |',
    '|---|---|---|',
    ...LOGIN_STAFF.map((p) => {
      const s = staffRole(p);
      const role = s.roles.includes('hod') ? `HoD, ${PROFILE === 'school' && s.dept ? SCHOOL_DEPT_NAMES[s.dept] : s.dept}` : PROFILE === 'school' && s.roles[0] === 'teacher' ? `teacher (${SCHOOL_DEPT_NAMES[s.dept!]})` : s.roles[0].replace(/_/g, ' ');
      return `| ${role} | ${s.name} | ${p}@${DOMAIN} |`;
    }),
    ...studentRows.map((s) => `| student | ${s.name} (${s.roll}, ${s.sec}) | ${s.name === INST.strong.name ? INST.strong.login : INST.weak.login}@${DOMAIN} |`),
    `| alumnus (alumni portal) | the first alumni profile | alumnus@${DOMAIN} |`,
    `| guardian | ${INST.strong.parentName} (father of ${INST.strong.name}) | ${INST.strong.parentLogin}@${DOMAIN} |`,
    `| guardian | ${INST.weak.parentName} (mother of ${INST.weak.name} and ${INST.sibling.name}) | ${INST.weak.parentLogin}@${DOMAIN} |`,
    '',
    'Other staff sign in with `<email prefix>@' + DOMAIN + '` ' + (PROFILE === 'school' ? '(for example `admissions`, `warden`, `transport`, `stores`, `grievance`, `hod.languages`, `hod.social`, `hod.computers`, `hod.commerce`).' : '(for example `admissions`, `placements`, `warden`, `transport`, `stores`, `grievance`, `research`).'),
    '',
    `Institution: ${INST.address}. ${INST.affiliation}, ${INST.scheme}, academic year 2026-27.`,
    '',
  ];
  return lines.join('\n');
}

/**
 * The shared stages look classes up by college programme and semester (for example BCom semester 3).
 * For the school, each school stage answers to a college programme code, and its n-th class to semester 2n+1,
 * so those lookups land on a school class. Only lookups that find nothing fall back to these aliases.
 */
const PROG_ALIAS: Record<string, string[]> = { PRI: ['BBA'], MID: ['BCA'], SEC: ['BCM'], SCI: ['MBA'], COM: ['BAV', 'MCM'] };
type Aliased = { prog: string; term: number };
const views = <T extends Aliased>(x: T): T[] => {
  const def = PROGRAMS.find((p) => p.code === x.prog);
  if (!def) return [];
  const idx = def.classes.findIndex(([t]) => t === x.term);
  return (PROG_ALIAS[x.prog] ?? []).map((prog) => ({ ...x, prog, term: 1 + 2 * idx }));
};
class AliasList<T extends Aliased> extends Array<T> {
  static get [Symbol.species]() {
    return Array;
  }
  override find(pred: (v: T, i: number, a: T[]) => unknown): T | undefined {
    const hit = super.find(pred as (v: T, i: number, a: T[]) => boolean);
    return hit !== undefined ? hit : super.find((x, i, a) => views(x).some((v) => pred(v, i, a)));
  }
  override filter(pred: (v: T, i: number, a: T[]) => unknown): T[] {
    const hits = super.filter(pred as (v: T, i: number, a: T[]) => boolean);
    return hits.length ? hits : super.filter((x, i, a) => views(x).some((v) => pred(v, i, a)));
  }
}
function aliasCollegeProgrammes(ctx: Ctx): void {
  ctx.sections = AliasList.from(ctx.sections) as unknown as Ctx['sections'];
  ctx.students = AliasList.from(ctx.students) as unknown as Ctx['students'];
  for (const [school, codes] of Object.entries(PROG_ALIAS)) for (const code of codes) ctx.programs[code] ??= ctx.programs[school];
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
    await readPool?.end();
  });
