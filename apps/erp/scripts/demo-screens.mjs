// Takes the representative ERP screenshots into docs/demo/screens/ (see the README there).
// Needs the ERP and the API with the Soundarya seed (docs/demo/SOUNDARYA_DEMO_LOGINS.md):
//   ERP_URL=http://localhost:3199 API_URL=http://localhost:4199 \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/demo-screens.mjs [name-filter]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3199';
const API = process.env.API_URL ?? 'http://localhost:4199';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/demo/screens');
const only = process.argv[2]?.split(',');
const domain = 'soundarya.demo.kinetix.in';

const settle = async (page) => {
  await page.locator('main h1').first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);
};
const clickText = async (page, text) => {
  await page.getByText(text, { exact: false }).first().click({ timeout: 8000 });
  await page.waitForTimeout(800);
};

/** name, url, optional login prefix, phone width, and steps after the page loads. */
const SHOTS = [
  { name: '01-dashboard', url: '/' },
  { name: '02-students', url: '/students' },
  {
    name: '03-record-list-bulk-bar',
    url: '/students',
    run: async (p) => {
      const boxes = p.locator('main tbody [role=checkbox]');
      for (let i = 0; i < 3; i++) await boxes.nth(i).click();
      await p.waitForTimeout(400);
    },
  },
  { name: '04-messages-composer', url: '/messages' },
  { name: '05-conversations-chat', url: '/conversations/edf92918-410d-4af0-82ed-0dbda6b55a32?view=all' },
  {
    name: '06-report-builder',
    url: '/reports/builder',
    run: async (p) => {
      await clickText(p, 'Fee invoices and dues');
      await p.waitForTimeout(1500);
    },
  },
  { name: '07-accreditation-naac-hub', url: '/accreditation/naac-aff-ug' },
  { name: '08-document-template-gallery', url: '/documents/templates?type=bonafide_certificate' },
  {
    name: '09-document-designer',
    url: '/documents/templates?type=student_id_card',
    run: async (p) => {
      await p.getByRole('button', { name: /Customise/ }).first().click();
      await p.waitForURL(/\/edit/, { timeout: 20000 });
      await settle(p);
      await p.waitForTimeout(1500);
    },
  },
  { name: '10-id-card-preview', url: '/documents/templates?type=student_id_card' },
  { name: '11-marks-card-preview', url: '/documents/templates?type=marks_card' },
  {
    name: '12-fee-counter',
    url: '/fees/counter',
    run: async (p) => {
      await p.getByPlaceholder(/Name, roll number or phone/).fill('Harish');
      await p.waitForTimeout(1500);
      await p.getByRole('option').first().click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(1500);
    },
  },
  { name: '13-payroll', url: '/payroll' },
  { name: '14-library-desk', url: '/library/desk' },
  { name: '15-hostel-desk', url: '/hostel/desk' },
  { name: '16-timetable', url: '/timetable' },
  {
    name: '17-attendance-mark',
    url: '/attendance/mark',
    run: async (p) => {
      await clickText(p, 'Business Mathematics');
      await p.waitForTimeout(1200);
    },
  },
  { name: '18-exams-result-processing', url: '/exams/results-desk/processing' },
  { name: '19-settings-branding', url: '/settings/branding' },
  { name: '20-settings-roles', url: '/settings/roles' },
  {
    name: '21-workflow-canvas',
    url: '/workflows/builder',
    run: async (p) => {
      // Open the first route's canvas from the list (a fresh tab, so the tab strip shows one page).
      const href = await p.locator('main [data-href^="/workflows/builder/"], main a[href^="/workflows/builder/"]').first().evaluate((el) => el.getAttribute('data-href') ?? el.getAttribute('href'));
      await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('kx.tabs')) localStorage.removeItem(k); });
      await p.goto(ERP + href);
      await settle(p);
    },
  },
  { name: '22-ptm', url: '/ptm' },
  { name: '23-diary', url: '/diary' },
  { name: '24-phone-dashboard', url: '/', phone: true },
  { name: '25-phone-fees', url: '/fees', phone: true },
];

const tokens = new Map();
/** One sign-in per login for the whole run (sign-ins are rate limited). */
async function token(prefix) {
  if (tokens.has(prefix)) return tokens.get(prefix);
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: 'soundarya', login: `${prefix}@${domain}`, password: 'kinetix123' }) });
  const t = (await r.json()).accessToken;
  if (!t) throw new Error(`sign-in failed for ${prefix} (${r.status})`);
  tokens.set(prefix, t);
  return t;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
for (const s of SHOTS.filter((x) => !only || only.some((o) => x.name.includes(o)))) {
  const ctx = await browser.newContext({ viewport: s.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: s.phone ? 2 : 1, colorScheme: 'light' });
  await ctx.addCookies([
    { name: 'kx_session', value: await token(s.login ?? 'principal'), url: ERP },
    { name: 'kx_lang', value: 'en', url: ERP },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto(ERP + s.url);
    await settle(page);
    if (s.run) await s.run(page);
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    console.log('saved', s.name);
  } catch (e) {
    console.log('FAILED', s.name, e.message.split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
