// Checks the fees, accounts and finance pages at 1280px and 390px (loads, no error state, no sideways scroll, no
// console errors) and saves the fee screenshots into docs/demo/screens/fees/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3310 API_URL=http://localhost:4100 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/fees-qa.mjs [--shots-only]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3310';
const API = process.env.API_URL ?? 'http://localhost:4100';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/fees');
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
async function call(prefix, method, url, body) {
  const r = await fetch(`${API}${url}`, { method, headers: { authorization: `Bearer ${await token(prefix)}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

const REPORTS = ['daily-collection', 'mode-wise', 'head-collection', 'ageing', 'defaulters', 'concessions', 'scholarship-tracker', 'refunds', 'gateway-recon', 'gst', 'audit-trail', 'payment-links', 'reminders-sent', 'duplicates', 'fee-account-summary', 'trial-balance', 'income-expenditure', 'balance-sheet'];
const PAGES = [
  '/fees',
  '/fees/counter',
  '/fees/invoices',
  '/fees/dues',
  '/fees/structures',
  '/fees/setup',
  '/fees/setup?tab=accounts',
  '/fees/gateways',
  '/fees/payment-links',
  '/fees/duplicates',
  '/fees/scholarships',
  '/fees/challans',
  '/fees/bank-transfers',
  '/fees/holds',
  '/fees/plans',
  '/fees/sponsors',
  '/accounts',
  '/accounts/bank',
  '/accounts/settings',
  '/accounts/reports',
  ...REPORTS.map((r) => `/accounts/reports/${r}`),
  '/budgets',
  '/settlements',
  '/tally',
  '/gl-export',
  '/scholarships',
];

const settle = async (page) => {
  await page.locator('main h1, h1').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'accounts') {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: width < 500 ? 2 : 1, colorScheme: 'light' });
  if (login) {
    await ctx.addCookies([
      { name: 'kx_session', value: await token(login), url: ERP },
      { name: 'kx_lang', value: 'en', url: ERP },
    ]);
  }
  return ctx;
}

let failures = 0;
if (!shotsOnly) {
  for (const width of [1280, 390]) {
    const ctx = await open(width, 'principal');
    for (const url of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text()) && errors.push(m.text().slice(0, 160)));
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      const res = await page.goto(ERP + url, { timeout: 120000 }).catch((e) => ({ status: () => 0, e }));
      await settle(page);
      const facts = await page.evaluate(() => ({
        h1: document.querySelector('main h1, h1')?.textContent?.trim() ?? '',
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        error: !!document.querySelector('[role=alert].error-state, [data-testid=error-state]') || /Something went wrong|Application error/.test(document.body.innerText),
      }));
      const ok = res.status() === 200 && facts.h1 && facts.sideways <= 1 && !facts.error && errors.length === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${width} ${url} status=${res.status()} h1="${facts.h1}" sideways=${facts.sideways}${facts.error ? ' error-state' : ''}${errors.length ? ` console=${JSON.stringify(errors)}` : ''}`);
      await page.close();
    }
    await ctx.close();
  }
}

// A fresh payment link for the public pay page (the seed's links keep their tokens secret).
const dues = await call('accounts', 'GET', '/v1/fee-accounts/reports/defaulters?asOn=2027-03-31');
const rows = dues?.rows ?? [];
let payPath = null;
for (const r of rows.slice(0, 10)) {
  const inv = (await call('accounts', 'GET', `/v1/fees/students/${r.id}`))?.invoices?.find((i) => i.status === 'due')?.id;
  if (!inv) continue;
  const link = await call('accounts', 'POST', '/v1/fees/payment-links', { invoiceId: inv, channels: [], validDays: 3 });
  if (link?.url) {
    payPath = `/pay/${link.url.split('/').slice(-2).join('/')}`;
    break;
  }
}

mkdirSync(OUT, { recursive: true });
const SHOTS = [
  { name: '01-fee-accounts', url: '/fees/setup?tab=accounts', login: 'principal' },
  { name: '02-gateways', url: '/fees/gateways', login: 'principal' },
  { name: '03-payment-links', url: '/fees/payment-links' },
  { name: '04-scholarship-tracker', url: '/accounts/reports/scholarship-tracker' },
  { name: '05-defaulters', url: '/accounts/reports/defaulters' },
  { name: '06-duplicates', url: '/fees/duplicates' },
  { name: '07-ageing', url: '/accounts/reports/ageing' },
  ...(payPath ? [{ name: '08-pay-link-phone', url: payPath, width: 390, login: null }] : []),
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280, s.login === undefined ? 'accounts' : s.login);
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
