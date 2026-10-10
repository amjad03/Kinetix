// Capture ERP screens (1920x1080 @2x) from the local Soundarya demo with system Chrome.
// Usage: node capture/erp.mjs   (ERP on :3000, API on :4000; local demo seed creds)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.ERP_URL ?? 'http://localhost:3000';
const OUT = new URL('../shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const PAGES = (process.env.PAGES ?? 'dashboard:/,admissions:/admissions,exams:/exams,fees:/fees,hr:/hr,obe:/obe/matrix,ai:/ai,evaluation:/evaluation')
  .split(',').map((s) => s.split(/:(.*)/s).slice(0, 2));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
if (process.env.LIGHT) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.type('input[name=tenant]', 'soundarya').catch(() => {});
await page.evaluate(() => { const t = document.querySelector('input[name=tenant]'); if (t) t.value = 'soundarya'; });
await page.type('input[name=login]', process.env.ERP_LOGIN ?? 'principal@soundarya.demo.kinetix.in');
await page.type('input[name=password]', process.env.ERP_PASSWORD ?? 'kinetix123');
await Promise.all([page.waitForNavigation({ timeout: 120000 }).catch(() => {}), page.keyboard.press('Enter')]);
console.log('after login', page.url());
for (const [name, path] of PAGES) {
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 180000 });
    await new Promise((r) => setTimeout(r, 1500));
    if (process.env.CLICK) { const [n, txt] = process.env.CLICK.split('='); if (n === name) { await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)?.click(), txt); await new Promise((r) => setTimeout(r, 15000)); } }
    await page.screenshot({ path: `${OUT}erp-${name}.jpg`, type: 'jpeg', quality: 90 });
    console.log('ok', name, page.url());
  } catch (e) { console.log('fail', name, e.message); }
}
await browser.close();
