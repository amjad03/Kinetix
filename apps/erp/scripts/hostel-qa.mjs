// Checks the hostel and mess pages of the production pass at 1280px and 390px (loads, no error state, no sideways
// scroll, no console errors), as the chief warden, the block-scoped girls' warden, the accountant and the IQAC, and
// saves the hostel screenshots into docs/demo/screens/hostel/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3340 API_URL=http://localhost:4340 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/hostel-qa.mjs [--shots-only] [--out dir]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3340';
const API = process.env.API_URL ?? 'http://localhost:4340';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/hostel');
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

const views = ['hostels', 'hostel-rooms', 'hostel-residents', 'hostel-applications', 'hostel-settlements', 'hostel-gate-passes', 'hostel-gate-log', 'hostel-late-entries', 'hostel-sickbay', 'hostel-committees', 'hostel-staff', 'hostel-room-assets', 'mess-plans', 'mess-bills', 'mess-expenses', 'mess-inspections'];
const PAGES = [
  ['/hostel', 'warden'],
  ['/hostel/desk', 'warden'],
  ['/hostel/gate', 'warden'],
  ['/hostel/gate', 'warden.girls'],
  ['/hostel/reports', 'warden'],
  ['/hostel/reports?tab=defaulters', 'accounts'],
  ['/hostel/reports?tab=aishe', 'iqac'],
  ...views.map((v) => [`/hostel/records?view=${v}`, 'warden']),
  ['/hostel/records?view=hostel-residents', 'warden.girls'],
  ['/ops-reports/hostel.defaulters', 'warden'],
  ['/ops-reports/hostel.gate-log', 'warden'],
];

const settle = async (page) => {
  await page.locator('main h1').first().waitFor({ timeout: 45000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'warden') {
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
      })).catch(() => ({ h1: '', sideways: 0, error: true }));
      const ok = res.status() === 200 && facts.h1 && facts.sideways <= 1 && !facts.error && errors.length === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${width} ${login} ${url} status=${res.status()} h1="${facts.h1}" sideways=${facts.sideways}${facts.error ? ' error-state' : ''}${errors.length ? ` console=${JSON.stringify(errors)}` : ''}`);
      await page.close();
    }
    for (const c of ctxs.values()) await c.close();
  }
}

// The screenshots.
mkdirSync(OUT, { recursive: true });
const SHOTS = [
  { name: '01-warden-desk', url: '/hostel/desk', login: 'warden' },
  { name: '02-gate', url: '/hostel/gate', login: 'warden' },
  { name: '03-gate-log', url: '/hostel/records?view=hostel-gate-log', login: 'warden' },
  { name: '04-compliance', url: '/hostel/reports', login: 'warden' },
  { name: '05-defaulters', url: '/hostel/reports?tab=defaulters', login: 'accounts' },
  { name: '06-aishe-naac', url: '/hostel/reports?tab=aishe', login: 'iqac' },
  { name: '07-diet-bills', url: '/hostel/records?view=mess-bills', login: 'warden' },
  { name: '08-gate-phone', url: '/hostel/gate', login: 'warden.girls', width: 390 },
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280, s.login);
  const page = await ctx.newPage();
  try {
    await page.goto(ERP + s.url, { timeout: 90000 });
    await settle(page);
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
