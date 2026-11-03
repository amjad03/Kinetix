// Checks the academics and timetable pages at 1280px and 390px (loads, no error state, no sideways scroll, no console
// errors) and saves the screenshots into docs/demo/screens/academics/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3320 API_URL=http://localhost:4320 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/academics-qa.mjs [--shots-only] [--out dir]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3320';
const API = process.env.API_URL ?? 'http://localhost:4320';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/academics');
const domain = 'soundarya.demo.zynetix.in';
const shotsOnly = process.argv.includes('--shots-only');

const tokens = new Map();
async function token(prefix) {
  if (tokens.has(prefix)) return tokens.get(prefix);
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: 'soundarya', login: `${prefix}@${domain}`, password: 'zynetix123' }) });
  const t = (await r.json()).accessToken;
  if (!t) throw new Error(`sign-in failed for ${prefix} (${r.status})`);
  tokens.set(prefix, t);
  return t;
}
async function get(prefix, url) {
  const r = await fetch(`${API}${url}`, { headers: { authorization: `Bearer ${await token(prefix)}` } });
  return r.json();
}

const versions = (await get('principal', '/v1/timetable-studio/versions'))?.rows ?? [];
const draft = versions.find((v) => v.status === 'draft') ?? versions[0];
const completion = (await get('hod.commerce', '/v1/teaching-log/completion'))?.rows ?? [];
const pair = completion.find((r) => r.logged > 0) ?? completion[0];
const registerUrl = pair ? `/teaching-diary?tab=register&pair=${pair.sectionId}%7C${pair.subjectId}` : '/teaching-diary?tab=register';

const PAGES = [
  ['/timetable/studio', 'principal'],
  ...(draft ? [[`/timetable/studio/${draft.id}`, 'principal']] : []),
  ['/timetable', 'principal'],
  ['/timetable/setup?tab=unavailability', 'principal'],
  ['/timetable/setup?tab=days', 'principal'],
  ['/teaching-diary', 'hod.commerce'],
  ['/teaching-diary?tab=diary', 'hod.commerce'],
  [registerUrl, 'hod.commerce'],
  ['/teaching-diary', 'principal'],
  ['/timetable/studio', 'hod.commerce'],
];

const settle = async (page) => {
  await page.locator('main h1').first().waitFor({ timeout: 25000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'principal') {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: width < 500 ? 2 : 1, colorScheme: 'light' });
  await ctx.addCookies([
    { name: 'kx_session', value: await token(login), url: ERP },
    { name: 'kx_lang', value: 'en', url: ERP },
  ]);
  return ctx;
}

let failures = 0;
if (!shotsOnly) {
  for (const width of [1280, 390]) {
    const ctxs = new Map();
    for (const [url, login] of PAGES) {
      if (!ctxs.has(login)) ctxs.set(login, await open(width, login));
      const page = await ctxs.get(login).newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text()) && errors.push(m.text().slice(0, 160)));
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      const res = await page.goto(ERP + url).catch((e) => ({ status: () => 0, e }));
      await settle(page);
      const facts = await page.evaluate(() => ({
        h1: document.querySelector('main h1')?.textContent?.trim() ?? '',
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        error: !!document.querySelector('[role=alert].error-state, [data-testid=error-state]') || /Something went wrong|Application error/.test(document.body.innerText),
      }));
      const ok = res.status() === 200 && facts.h1 && facts.sideways <= 1 && !facts.error && errors.length === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${width} ${login} ${url} status=${res.status()} h1="${facts.h1}" sideways=${facts.sideways}${facts.error ? ' error-state' : ''}${errors.length ? ` console=${JSON.stringify(errors)}` : ''}`);
      await page.close();
    }
    for (const c of ctxs.values()) await c.close();
  }
}

mkdirSync(OUT, { recursive: true });
const SHOTS = [
  { name: '01-studio-versions', url: '/timetable/studio' },
  { name: '02-studio-week', url: draft ? `/timetable/studio/${draft.id}` : '/timetable/studio' },
  // A drag over a busy cell: the clash shows before the drop.
  {
    name: '03-studio-drag-clash',
    url: draft ? `/timetable/studio/${draft.id}` : '/timetable/studio',
    run: async (page) => {
      const cards = page.locator('[data-testid=studio-slot][draggable=true]');
      if ((await cards.count()) < 2) return;
      const target = page.locator('td[data-cell]').filter({ has: page.locator('[data-testid=studio-slot]') }).nth(3);
      await cards.first().dragTo(target, { steps: 6 }).catch(() => {});
      await page.waitForTimeout(800);
    },
  },
  { name: '04-unavailability', url: '/timetable/setup?tab=unavailability' },
  { name: '05-working-day-norms', url: '/timetable/setup?tab=days' },
  { name: '06-syllabus-completion', url: '/teaching-diary', login: 'hod.commerce' },
  { name: '07-diary-entries', url: '/teaching-diary?tab=diary', login: 'hod.commerce' },
  { name: '08-course-register-phone', url: registerUrl, login: 'hod.commerce', width: 390 },
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280, s.login);
  const page = await ctx.newPage();
  try {
    await page.goto(ERP + s.url);
    await settle(page);
    if (s.run) await s.run(page);
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: true });
    console.log('saved', s.name);
  } catch (e) {
    failures++;
    console.log('FAILED', s.name, e.message.split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} problem(s)` : 'all pages ok');
process.exit(failures ? 1 : 0);
