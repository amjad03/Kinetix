// Checks the placement cell's pages of the production pass at 1280px and 390px (loads, no error state, no sideways
// scroll, no console errors) and saves the screenshots into docs/demo/screens/placements/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3330 API_URL=http://localhost:4330 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/placements-qa.mjs [--shots-only] [--out dir]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3330';
const API = process.env.API_URL ?? 'http://localhost:4330';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/placements');
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

// Records the pages open: the analytics drive (stricter criteria), its company, an apprenticeship, a training.
const drive = (await get('placements', '/v1/records/placement-drives?q=Junior%20Data%20Analyst&pageSize=1')).rows[0];
const company = (await get('placements', '/v1/records/placement-companies?f.followUp=due&pageSize=1')).rows[0];
const apprentice = (await get('placements', '/v1/records/apprenticeships?f.status=ongoing&pageSize=1')).rows[0];
const training = (await get('placements', '/v1/records/placement-trainings?pageSize=1')).rows[0];

const PAGES = [
  ['/placements', 'placements'],
  ...['drives', 'companies', 'crm', 'documents', 'offers', 'internships', 'log', 'apprenticeships', 'training', 'progression', 'referrals', 'feedback', 'students'].map((v) => [`/placements?view=${v}`, 'placements']),
  ['/placements?view=documents', 'hod.commerce'],
  [`/placements/drives/${drive.id}`, 'placements'],
  [`/placements/companies/${company.id}`, 'placements'],
  [`/placements/apprenticeships/${apprentice.id}`, 'placements'],
  [`/placements/trainings/${training.id}`, 'placements'],
  ...['branch', 'nirf', 'naac52', 'aishe', 'credits', 'apprenticeships', 'companies', 'offers'].map((r) => [`/placements/reports?report=${r}&year=${r === 'credits' ? 2027 : 2026}`, 'placements']),
  ['/placements/reports?report=naac52&year=2026', 'iqac'],
];

const settle = async (page) => {
  await page.locator('main h1').first().waitFor({ timeout: 45000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'placements') {
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
      const res = await page.goto(ERP + url, { timeout: 90000 }).catch((e) => ({ status: () => 0, e }));
      await settle(page);
      const facts = await page.evaluate(() => ({
        h1: document.querySelector('main h1')?.textContent?.trim() ?? '',
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        error: !!document.querySelector('[role=alert].error-state, [data-testid=error-state]') || /Something went wrong|Application error/.test(document.body.innerText),
      }));
      const ok = res.status() === 200 && facts.h1 && facts.sideways <= 1 && !facts.error && errors.length === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${width} ${url} (${login}) status=${res.status()} h1="${facts.h1}" sideways=${facts.sideways}${facts.error ? ' error-state' : ''}${errors.length ? ` console=${JSON.stringify(errors)}` : ''}`);
      await page.close();
    }
    for (const c of ctxs.values()) await c.close();
  }
}

// The screenshots.
mkdirSync(OUT, { recursive: true });
const SHOTS = [
  { name: '01-recruiters-crm', url: '/placements?view=companies' },
  { name: '02-company-log', url: `/placements/companies/${company.id}`, run: (p) => p.getByRole('tab', { name: /Interactions/ }).click() },
  { name: '03-drive-criteria', url: `/placements/drives/${drive.id}`, run: (p) => p.getByRole('tab', { name: /Eligible/ }).click() },
  { name: '04-documents-queue', url: '/placements?view=documents' },
  { name: '05-apprenticeship-stipends', url: `/placements/apprenticeships/${apprentice.id}` },
  { name: '06-naac-5-2', url: '/placements/reports?report=naac52&year=2026' },
  { name: '07-nirf-3-years', url: '/placements/reports?report=nirf&year=2026' },
  { name: '08-aishe-phone', url: '/placements/reports?report=aishe&year=2026', width: 390 },
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280, s.login ?? 'placements');
  const page = await ctx.newPage();
  try {
    await page.goto(ERP + s.url, { timeout: 90000 });
    await settle(page);
    if (s.run) {
      await s.run(page);
      await page.waitForTimeout(800);
    }
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
