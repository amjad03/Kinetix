// Checks the transport pages of the production pass at 1280px and 390px (loads, no error state, no sideways scroll,
// no console errors) as the transport manager and the principal, and saves the transport screenshots into
// docs/demo/screens/transport/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3340 API_URL=http://localhost:4340 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/transport-qa.mjs [--shots-only] [--out dir]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3340';
const API = process.env.API_URL ?? 'http://localhost:4340';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/transport');
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

const views = ['transport-vehicles', 'transport-drivers', 'transport-safety-checks', 'transport-maintenance', 'transport-expenses', 'transport-routes', 'transport-stops', 'transport-fare-slabs', 'transport-overrides', 'transport-riders', 'transport-change-requests', 'transport-fee-adjustments', 'transport-pickup-persons', 'transport-handovers', 'transport-duty', 'transport-trips', 'transport-boardings', 'transport-alerts', 'transport-incidents'];
const reports = ['transport.occupancy', 'transport.collection', 'transport.defaulters', 'transport.trip-sheet', 'transport.boardings', 'transport.fee-dues', 'transport.stop-list', 'transport.expiry-calendar'];
const PAGES = [
  ['/transport', 'transport'],
  ['/transport/desk', 'transport'],
  ['/transport/live', 'transport'],
  ['/transport/safety', 'transport'],
  ['/transport/safety?tab=capacity', 'transport'],
  ['/transport/safety?tab=fares', 'transport'],
  ['/transport/live', 'principal'],
  ...views.map((v) => [`/transport/records?view=${v}`, 'transport']),
  ...reports.map((r) => [`/ops-reports/${r}`, 'transport']),
  ['/module-settings/transport', 'transport'],
];

const settle = async (page) => {
  await page.locator('main h1').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'transport') {
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
      // Map tiles come from OpenStreetMap; a sandbox without that network logs failed image loads, which are not page errors.
      page.on('console', (m) => m.type() === 'error' && !/favicon|Download the React DevTools|tile\.openstreetmap|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 160)));
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      const res = await page.goto(ERP + url, { timeout: 120000 }).catch((e) => ({ status: () => 0, e }));
      await settle(page);
      const facts = await page
        .evaluate(() => ({
          h1: document.querySelector('main h1')?.textContent?.trim() ?? '',
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          error: !!document.querySelector('[role=alert].error-state, [data-testid=error-state]') || /Something went wrong|Application error/.test(document.body.innerText),
        }))
        .catch(() => ({ h1: '', sideways: 0, error: true }));
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
  { name: '01-live-map', url: '/transport/live' },
  { name: '02-safety-matrix', url: '/transport/safety' },
  { name: '03-capacity', url: '/transport/safety?tab=capacity' },
  { name: '04-fares-by-distance', url: '/transport/safety?tab=fares' },
  { name: '05-boarding-log', url: '/transport/records?view=transport-boardings' },
  { name: '06-defaulters', url: '/ops-reports/transport.defaulters' },
  { name: '07-desk', url: '/transport/desk' },
  { name: '08-live-phone', url: '/transport/live', width: 390 },
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280);
  const page = await ctx.newPage();
  try {
    await page.goto(ERP + s.url, { timeout: 120000 });
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
