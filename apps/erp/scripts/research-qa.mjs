// Checks the research office's pages of the production pass at 1280px and 390px (loads, no error state, no sideways
// scroll, no console errors) and saves the screenshots into docs/demo/screens/research/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3370 API_URL=http://localhost:4370 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/research-qa.mjs [--shots-only] [--out dir]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3370';
const API = process.env.API_URL ?? 'http://localhost:4370';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/research');
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

// The AICTE grant (heads, two instalments, a UC accepted) for the statement.
const grant = (await get('research', '/v1/records/research-grants?q=AICTE&pageSize=1')).rows[0];
const L = (view, list) => `/research?view=${view}&list=${list}`;
const PAGES = [
  ['/research', 'research'],
  ...['outputs', 'funding', 'collab', 'scholars', 'facilities', 'reports'].map((v) => [`/research?view=${v}`, 'research']),
  ...[['outputs', 'research-profiles'], ['outputs', 'research-incentive-claims'], ['funding', 'grant-heads'], ['funding', 'grant-releases'], ['funding', 'research-incentive-schemes'], ['funding', 'research-grants'], ['scholars', 'scholar-progress-reports'], ['scholars', 'research-centres'], ['scholars', 'research-scholars'], ['outputs', 'research-conferences']].map(([v, l]) => [L(v, l), 'research']),
  [`/research?view=reports&grant=${grant.id}`, 'research'],
  [L('outputs', 'research-publications'), 'hod.commerce'],
  [L('outputs', 'research-profiles'), 'hod.commerce'],
  [L('outputs', 'research-incentive-claims'), 'hod.commerce'],
  [L('scholars', 'scholar-progress-reports'), 'hod.commerce'],
  ['/research?view=reports', 'iqac'],
];

const settle = async (page) => {
  await page.locator('main h1').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'research') {
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
      const res = await page.goto(ERP + url, { timeout: 120000 }).catch((e) => ({ status: () => 0, e }));
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
const card = (id) => async (p) => {
  const el = p.locator(`[data-testid=${id}]`).first();
  await el.scrollIntoViewIfNeeded();
  return el.locator('xpath=ancestor::*[contains(@class, "rounded")][1]');
};
const SHOTS = [
  { name: '01-overview', url: '/research' },
  { name: '02-publications', url: L('outputs', 'research-publications') },
  { name: '03-researcher-profiles', url: L('outputs', 'research-profiles') },
  { name: '04-grant-statement', url: `/research?view=reports&grant=${grant.id}`, element: card('rsp-gs-uc') },
  { name: '05-incentive-claims', url: L('outputs', 'research-incentive-claims') },
  { name: '06-progress-reports', url: L('scholars', 'scholar-progress-reports') },
  { name: '07-nirf-nba-aishe', url: '/research?view=reports', element: card('rsp-nba') },
  { name: '08-reports-phone', url: '/research?view=reports', width: 390 },
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280, s.login ?? 'research');
  const page = await ctx.newPage();
  try {
    await page.goto(ERP + s.url, { timeout: 120000 });
    await settle(page);
    if (s.element) {
      const el = await s.element(page);
      await page.waitForTimeout(400);
      await el.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    } else await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: true });
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
