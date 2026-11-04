// Checks the governance pages of the production pass at 1280px and 390px (loads, no error state, no sideways
// scroll, no console errors) and saves the screenshots into docs/demo/screens/governance/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3390 API_URL=http://localhost:4390 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/governance-qa.mjs [--shots-only] [--out dir]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3390';
const API = process.env.API_URL ?? 'http://localhost:4390';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/governance');
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

// Records the pages open: the ICC, its signed meeting, the IQAC meeting still with the members, a policy with two versions.
const compliance = await get('iqac', '/v1/governance/committees/compliance');
const icc = compliance.committees.find((c) => c.kind === 'icc');
const iqacC = compliance.committees.find((c) => c.kind === 'iqac');
const iccDetail = await get('iqac', `/v1/governance/committees/${icc.id}`);
const iqacDetail = await get('iqac', `/v1/governance/committees/${iqacC.id}`);
const signedMeeting = iccDetail.meetings.find((m) => m.minutesStatus === 'approved' && / of 2026-27$/.test(m.title)) ?? iccDetail.meetings.find((m) => m.minutesStatus === 'approved');
const pendingMeeting = iqacDetail.meetings.find((m) => m.minutesStatus === 'circulated') ?? iqacDetail.meetings[0];
const policy = (await get('iqac', '/v1/records/governance-policies?q=POL%2FAR%2F01&pageSize=1')).rows[0];

const PAGES = [
  ['/governance', 'principal'],
  ['/governance/committees', 'iqac'],
  [`/governance/committees/${icc.id}`, 'iqac'],
  [`/governance/meetings/${signedMeeting.id}`, 'iqac'],
  [`/governance/meetings/${pendingMeeting.id}`, 'iqac'],
  ['/governance/policies', 'iqac'],
  [`/governance/policies/${policy.id}`, 'iqac'],
  ['/governance/rti', 'principal'],
  ['/governance/compliance', 'iqac'],
  ['/governance/compliance?view=list', 'iqac'],
  ['/governance/disclosure', 'iqac'],
  ['/governance/disclosure?view=lines', 'iqac'],
  ['/governance/mine', 'hod.commerce'],
  ['/disclosure/soundarya', 'principal'],
  ['/grievances', 'grievance'],
  ['/dpdp', 'principal'],
];

const settle = async (page) => {
  await page.locator('main h1, h1').first().waitFor({ timeout: 45000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'iqac', lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: width < 500 ? 2 : 1, colorScheme: 'light' });
  await ctx.addCookies([
    { name: 'kx_session', value: await token(login), url: ERP },
    { name: 'kx_lang', value: lang, url: ERP },
  ]);
  return ctx;
}

let failures = 0;
if (!shotsOnly) {
  for (const [width, lang] of [[1280, 'en'], [390, 'en'], [1280, 'kn']]) {
    const ctxs = new Map();
    for (const [url, login] of PAGES) {
      if (!ctxs.has(login)) ctxs.set(login, await open(width, login, lang));
      const page = await ctxs.get(login).newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text()) && errors.push(m.text().slice(0, 160)));
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      const res = await page.goto(ERP + url, { timeout: 90000 }).catch((e) => ({ status: () => 0, e }));
      await settle(page);
      const facts = await page.evaluate(() => ({
        h1: document.querySelector('main h1, h1')?.textContent?.trim() ?? '',
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        error: !!document.querySelector('[role=alert].error-state, [data-testid=error-state]') || /Something went wrong|Application error/.test(document.body.innerText),
        // Message keys that fell through untranslated show up as gp.x.y / rk.x.y in the page.
        rawKeys: (document.body.innerText.match(/\b(gp|rk|nav|grp)\.[a-zA-Z-]+\.[a-zA-Z0-9_.-]+/g) ?? []).slice(0, 5),
      }));
      const ok = res.status() === 200 && facts.h1 && facts.sideways <= 1 && !facts.error && errors.length === 0 && facts.rawKeys.length === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${width} ${lang} ${url} (${login}) status=${res.status()} h1="${facts.h1}" sideways=${facts.sideways}${facts.error ? ' error-state' : ''}${facts.rawKeys.length ? ` keys=${facts.rawKeys}` : ''}${errors.length ? ` console=${JSON.stringify(errors)}` : ''}`);
      await page.close();
    }
    for (const c of ctxs.values()) await c.close();
  }
}

// The screenshots.
mkdirSync(OUT, { recursive: true });
const SHOTS = [
  { name: '01-board-overview', url: '/governance', login: 'principal' },
  { name: '02-statutory-committees', url: '/governance/committees' },
  { name: '03-icc-composition', url: `/governance/committees/${icc.id}` },
  { name: '04-minutes-signed', url: `/governance/meetings/${signedMeeting.id}` },
  { name: '05-policy-versions', url: `/governance/policies/${policy.id}` },
  { name: '06-rti-register', url: '/governance/rti', login: 'principal' },
  { name: '07-compliance-calendar', url: '/governance/compliance' },
  { name: '08-public-disclosure-phone', url: '/disclosure/soundarya', width: 390 },
  { name: '09-overview-phone', url: '/governance', login: 'principal', width: 390 },
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280, s.login ?? 'iqac');
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
