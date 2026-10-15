// Exploration helper: screenshots routes as a given login and dumps tabs/buttons/links.
// Usage: node explore.mjs <loginPrefix> <outDir> <route> [route...]
import puppeteer from '../../promo/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { mkdirSync, writeFileSync } from 'node:fs';
const [, , who, out, ...routes] = process.argv;
mkdirSync(out, { recursive: true });
const ERP = 'http://localhost:3000', API = 'http://localhost:4000';
const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: 'soundarya', login: `${who}@soundarya.demo.zynetix.in`, password: 'zynetix123' }) });
const { accessToken } = await r.json();
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu-compositing', '--disable-gpu-rasterization', '--force-color-profile=srgb', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
await page.setCookie({ name: 'kx_session', value: accessToken, domain: 'localhost', path: '/' });
for (const route of routes) {
  const name = route.replace(/[^a-z0-9]+/gi, '_') || 'home';
  try {
    await page.goto(ERP + route, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((res) => setTimeout(res, 800));
    await page.screenshot({ path: `${out}/${who}_${name}.png` });
    const info = await page.evaluate(() => {
      const t = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50);
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const main = document.querySelector('main') || document.body;
      return {
        url: location.pathname + location.search,
        h: document.documentElement.scrollHeight,
        h1: [...main.querySelectorAll('h1,h2')].filter(vis).map(t).slice(0, 12),
        tabs: [...main.querySelectorAll('[role=tab],button')].filter(vis).map(t).filter(Boolean).slice(0, 40),
        links: [...main.querySelectorAll('a[href]')].filter(vis).map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/')).slice(0, 40),
      };
    });
    console.log(JSON.stringify({ route, ...info }));
  } catch (e) { console.log(`ERR ${route} ${e.message}`); }
}
await browser.close();
