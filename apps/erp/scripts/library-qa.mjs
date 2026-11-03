// Checks the library pages of the production pass at 1280px and 390px (loads, no error state, no sideways scroll, no console errors)
// and saves the library screenshots into docs/demo/screens/library/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3320 API_URL=http://localhost:4320 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/library-qa.mjs [--shots-only] [--out dir]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3320';
const API = process.env.API_URL ?? 'http://localhost:4320';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/library');
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

const PAGES = [
  ['/library', 'library'],
  ['/library/desk', 'library'],
  ['/library/opac', 'library'],
  ['/library/opac?q=accounting', 'library'],
  ['/library/kiosk', 'library'],
  ['/library/reports', 'library'],
  ['/library/circulation', 'library'],
  ['/library/e-resources', 'library'],
  ['/library/stock-checks', 'library'],
  ['/library/records?view=library-circ-rules', 'library'],
  ['/library/records?view=library-purchase-orders', 'library'],
  ['/library/records?view=library-invoices', 'library'],
  ['/library/records?view=library-vendors', 'library'],
  ['/library/records?view=library-binding', 'library'],
  ['/library/records?view=library-eresource-usage', 'library'],
  ['/library/records?view=library-copies', 'library'],
  ['/library/records?view=library-issues', 'library'],
  ['/library/reports', 'principal'],
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
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${width} ${url} status=${res.status()} h1="${facts.h1}" sideways=${facts.sideways}${facts.error ? ' error-state' : ''}${errors.length ? ` console=${JSON.stringify(errors)}` : ''}`);
      await page.close();
    }
    for (const c of ctxs.values()) await c.close();
  }
}

// The screenshots.
mkdirSync(OUT, { recursive: true });
const SHOTS = [
  { name: '01-desk', url: '/library/desk', login: 'library' },
  { name: '02-opac-facets', url: '/library/opac?q=management', login: 'library' },
  { name: '03-rules-matrix', url: '/library/records?view=library-circ-rules', login: 'library' },
  { name: '04-purchase-orders', url: '/library/records?view=library-purchase-orders', login: 'library' },
  { name: '05-reports-naac', url: '/library/reports', login: 'library' },
  { name: '06-kiosk', url: '/library/kiosk', login: 'library' },
  { name: '07-eresource-usage', url: '/library/records?view=library-eresource-usage', login: 'library' },
  { name: '08-opac-phone', url: '/library/opac?q=accounting', login: 'library', width: 390 },
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
