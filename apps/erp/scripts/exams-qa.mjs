// Checks every examinations and results page at 1280px and 390px (loads, no error state, no sideways scroll, no
// console errors) and saves the exam screenshots into docs/demo/screens/exams/.
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3310 API_URL=http://localhost:4310 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/exams-qa.mjs [--shots-only]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3310';
const API = process.env.API_URL ?? 'http://localhost:4310';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens/exams');
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

const sessions = (await get('controller', '/v1/exam-sessions')) ?? [];
const sem5 = sessions.find((s) => s.kind === 'regular' && s.status === 'scheduled');
const supp = sessions.find((s) => s.kind === 'supplementary');
const published = sessions.find((s) => s.status === 'published');

const PAGES = [
  '/exams',
  `/exams/${sem5.id}`,
  `/exams/${sem5.id}/applications`,
  `/exams/${supp.id}/applications`,
  `/exams/${supp.id}/papers`,
  `/exams/${published.id}/registers`,
  `/exams/${supp.id}/registers`,
  '/exams/schemes',
  '/exams/university',
  '/exams/documents',
  '/exams/examiners',
  '/exams/operations',
  '/exams/office',
  '/exams/cell',
  '/exams/cell/duties',
  '/exams/cell/halls',
  '/exams/cell/malpractice',
  '/exams/cell/valuation',
  '/exams/results-desk',
  '/exams/results-desk/withheld',
  '/exams/results-desk/revaluations',
  `/exams/results-desk/registers?report=year_comparison&session=${published.id}`,
  `/exams/results-desk/registers?report=grade_distribution&session=${published.id}`,
  `/exams/results-desk/registers?report=pass_by_section&session=${published.id}`,
  '/exams/relative-grading',
  '/exams/unlock-requests',
  '/evaluation',
  '/evaluation/desk',
  '/results',
  // An assessment's marks page (results/[id] is an assessment): ASSESSMENT_ID, else left out.
  ...(process.env.ASSESSMENT_ID ? [`/results/${process.env.ASSESSMENT_ID}`] : []),
  '/question-bank',
];

const settle = async (page) => {
  await page.locator('main h1').first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(500);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function open(width, login = 'controller') {
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
    const ctx = await open(width);
    for (const url of PAGES) {
      const page = await ctx.newPage();
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
    await ctx.close();
  }
}

// The screenshots.
mkdirSync(OUT, { recursive: true });
const SHOTS = [
  { name: '01-applications', url: `/exams/${supp.id}/applications` },
  {
    name: '02-application-detail',
    url: `/exams/${supp.id}/applications`,
    run: async (p) => {
      await p.locator('[data-testid^="xf-open-"]').first().click();
      await p.locator('[data-testid=xf-application]').waitFor({ timeout: 15000 });
      await p.waitForTimeout(600);
    },
  },
  { name: '03-question-papers', url: `/exams/${supp.id}/papers` },
  {
    name: '04-set-coverage',
    url: `/exams/${supp.id}/papers`,
    run: async (p) => {
      await p.locator('[data-testid="xf-coverage-BCM-301"]').click();
      await p.locator('[data-testid=xf-coverage]').waitFor({ timeout: 15000 });
      await p.waitForTimeout(500);
    },
  },
  {
    name: '05-registers-ledger',
    url: `/exams/${published.id}/registers`,
    run: async (p) => {
      await p.locator('[data-testid=xf-ledger-student]').click({ force: true }).catch(() => {});
      await p.getByRole('option').nth(16).click({ timeout: 8000 }).catch(() => {});
      await p.locator('[data-testid=xf-ledger-rows]').waitFor({ timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(500);
      await p.locator('[data-testid=xf-ledger]').scrollIntoViewIfNeeded();
    },
  },
  { name: '06-unlock-requests', url: '/exams/unlock-requests', login: 'hod.commerce' },
  { name: '07-year-comparison', url: `/exams/results-desk/registers?report=year_comparison&session=${published.id}` },
  { name: '08-applications-phone', url: `/exams/${supp.id}/applications`, width: 390 },
];
for (const s of SHOTS) {
  const ctx = await open(s.width ?? 1280, s.login);
  const page = await ctx.newPage();
  try {
    await page.goto(ERP + s.url);
    await settle(page);
    if (s.run) await s.run(page);
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: !s.run });
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
