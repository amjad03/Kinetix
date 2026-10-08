// Takes the design review screenshots into docs/design/erp/ (dashboard light and dark, a data table, OBE).
// Needs the ERP and the demo-seeded API running:
//   ERP_URL=http://localhost:3010 CHROME=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome node scripts/design-screenshots.mjs [only-name]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3000';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/design/erp');
const only = process.argv[2];

const SHOTS = [
  { name: 'dashboard-light', url: '/', scheme: 'light' },
  { name: 'dashboard-dark', url: '/', scheme: 'dark' },
  { name: 'data-table', url: '/students', scheme: 'light' },
  { name: 'obe', url: process.env.OBE_PROGRAM ? `/obe?programId=${process.env.OBE_PROGRAM}` : '/obe', scheme: 'light' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  await ctx.addCookies([{ name: 'kx_lang', value: 'en', url: ERP }]);
  const page = await ctx.newPage();
  await page.goto(`${ERP}/login`);
  await page.locator('input[name=tenant]').fill('demo-college');
  await page.locator('input[name=login]').fill('principal@demo.kinetix.in');
  await page.locator('input[name=password]').fill('kinetix123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByTestId('school-name').waitFor();
  for (const s of SHOTS.filter((x) => x.scheme === scheme && (!only || x.name === only))) {
    await page.goto(`${ERP}${s.url}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: true });
    console.log('saved', s.name);
  }
  await ctx.close();
}
await browser.close();
