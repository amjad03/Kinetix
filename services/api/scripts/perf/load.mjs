#!/usr/bin/env node
// Load test for the 25 busiest API endpoints (what the Parent App home, the Teacher App and the ERP dashboard, students,
// attendance, fees and records pages call): VUS virtual users, each signed in as their own family or member of staff,
// loop over the endpoints for DURATION seconds. Prints p50 / p95 / p99 per endpoint and writes JSON (OUT).
// Against the seeded large tenant only (scripts/perf/seed-large-tenant.mjs); the API must run with
// LOGIN_PER_IP_PER_MINUTE high enough for the sign-ins.
//
//   API=http://localhost:4100 VUS=500 DURATION=60 OUT=perf-before.json node scripts/perf/load.mjs
import { writeFileSync } from 'node:fs';
import http from 'node:http';

const API = process.env.API ?? 'http://localhost:4100';
const VUS = Number(process.env.VUS ?? 500);
const DURATION = Number(process.env.DURATION ?? 60) * 1000;
const SLUG = process.env.SLUG ?? 'perf-college';
const PASSWORD = process.env.PERF_PASSWORD ?? 'perf-pass-123';
const FAMILIES = Number(process.env.FAMILIES ?? 400);
const STAFF = Number(process.env.STAFF_USERS ?? 40);
const agent = new http.Agent({ keepAlive: true, maxSockets: VUS });

function call(method, path, token, body) {
  const u = new URL(path, API);
  return new Promise((resolve) => {
    const t = process.hrtime.bigint();
    const req = http.request(u, { method, agent, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t) / 1e6, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', (e) => resolve({ status: 0, ms: Number(process.hrtime.bigint() - t) / 1e6, body: String(e) }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const login = async (email) => {
  const r = await call('POST', '/v1/auth/login', null, { tenant: SLUG, login: email, password: PASSWORD });
  if (r.status !== 201) throw new Error(`login ${email}: ${r.status} ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body).accessToken;
};

console.log(`Signing in ${FAMILIES} families and ${STAFF} staff…`);
const families = [];
for (let i = 0; i < FAMILIES; i++) {
  const n = 1 + Math.floor((i * 19997) % 20000);
  const token = await login(`parent${n}@perf.zynetix.in`);
  const kids = JSON.parse((await call('GET', '/v1/parent/children', token)).body);
  families.push({ token, kid: kids[0]?.id ?? kids[0]?.studentId });
}
const staff = [];
const principal = await login('staff1@perf.zynetix.in');
for (let i = 0; i < STAFF; i++) staff.push(await login(`staff${5 + i * 17}@perf.zynetix.in`));
const sections = JSON.parse((await call('GET', '/v1/attendance-desk/classes', principal)).body);
const sectionId = (Array.isArray(sections) ? sections : sections.rows ?? sections.classes ?? [])[0]?.id;
const today = new Date().toISOString().slice(0, 10);

/** [name, who, path(ctx)] — who is 'family', 'teacher' or 'principal'. */
const ENDPOINTS = [
  ['me', 'family', () => '/v1/me'],
  ['parent children', 'family', () => '/v1/parent/children'],
  ['child summary', 'family', (c) => `/v1/parent/children/${c.kid}/summary`],
  ['child attendance', 'family', (c) => `/v1/parent/children/${c.kid}/attendance?days=90`],
  ['child subjects', 'family', (c) => `/v1/parent/children/${c.kid}/subjects`],
  ['child diary', 'family', (c) => `/v1/parent/children/${c.kid}/diary`],
  ['child fees', 'family', (c) => `/v1/fees/students/${c.kid}`],
  ['child results', 'family', (c) => `/v1/results/students/${c.kid}`],
  ['child marks', 'family', (c) => `/v1/marks/students/${c.kid}`],
  ['notifications', 'family', () => '/v1/notifications'],
  ['announcements inbox', 'family', () => '/v1/announcements/inbox'],
  ['teacher classes', 'teacher', () => '/v1/teacher/classes'],
  ['teacher homework', 'teacher', () => '/v1/teacher/homework'],
  ['teacher me', 'teacher', () => '/v1/me'],
  ['attendance classes', 'teacher', () => '/v1/attendance-desk/classes'],
  ['attendance day', 'principal', () => `/v1/attendance-desk/day?sectionId=${sectionId}&date=${today}`],
  ['attendance dashboard', 'principal', () => '/v1/attendance-desk/dashboard'],
  ['attendance register', 'principal', () => `/v1/attendance-desk/register?sectionId=${sectionId}`],
  ['analytics kpis', 'principal', () => '/v1/analytics/kpis'],
  ['attendance week', 'principal', () => '/v1/admin/analytics/attendance-week'],
  ['students list', 'principal', () => `/v1/students?sectionId=${sectionId}`],
  ['records students', 'principal', () => '/v1/records/students?page=1&pageSize=50'],
  ['fees invoices', 'principal', () => '/v1/fees/invoices?status=due'],
  ['fees summary', 'principal', () => '/v1/fees/summary'],
  ['students absences', 'principal', () => '/v1/students/absences'],
];

const stats = Object.fromEntries(ENDPOINTS.map(([n]) => [n, { ms: [], errors: 0, statuses: {} }]));
const deadline = Date.now() + DURATION;
let done = 0;
console.log(`Running ${VUS} virtual users for ${DURATION / 1000}s against ${API}…`);
await Promise.all(
  Array.from({ length: VUS }, async (_, v) => {
    const fam = families[v % families.length];
    const teacher = staff[v % staff.length];
    let i = v % ENDPOINTS.length;
    while (Date.now() < deadline) {
      const [name, who, path] = ENDPOINTS[i++ % ENDPOINTS.length];
      const token = who === 'family' ? fam.token : who === 'teacher' ? teacher : principal;
      const r = await call('GET', path(fam), token);
      const s = stats[name];
      s.ms.push(r.ms);
      s.statuses[r.status] = (s.statuses[r.status] ?? 0) + 1;
      if (r.status === 0 || r.status >= 500) s.errors++;
      done++;
    }
  }),
);

const pct = (xs, p) => (xs.length ? xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);
const report = ENDPOINTS.map(([n]) => {
  const s = stats[n];
  return { endpoint: n, requests: s.ms.length, p50: +pct(s.ms, 50).toFixed(1), p95: +pct(s.ms, 95).toFixed(1), p99: +pct(s.ms, 99).toFixed(1), errors: s.errors, statuses: s.statuses };
});
console.log(`\n${'endpoint'.padEnd(24)} ${'reqs'.padStart(7)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'p99 ms'.padStart(8)}  statuses`);
for (const r of report) console.log(`${r.endpoint.padEnd(24)} ${String(r.requests).padStart(7)} ${String(r.p50).padStart(8)} ${String(r.p95).padStart(8)} ${String(r.p99).padStart(8)}  ${JSON.stringify(r.statuses)}`);
const all = Object.values(stats).flatMap((s) => s.ms);
console.log(`\nTotal ${done} requests, ${(done / (DURATION / 1000)).toFixed(0)} req/s, overall p50 ${pct(all, 50).toFixed(1)} ms, p95 ${pct(all, 95).toFixed(1)} ms`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ vus: VUS, durationS: DURATION / 1000, rps: done / (DURATION / 1000), p50: pct(all, 50), p95: pct(all, 95), endpoints: report }, null, 1));
agent.destroy();
