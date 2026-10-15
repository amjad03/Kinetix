// Probe helper: node probe.mjs <login> <route> <outPng> [jsFile]
// jsFile exports default async (page) => {...} run after load; then screenshot + dump text.
import puppeteer from '../../promo/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { pathToFileURL } from 'node:url';
const [, , who, route, out, js] = process.argv;
const r = await fetch('http://localhost:4000/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: 'soundarya', login: `${who}@soundarya.demo.zynetix.in`, password: 'zynetix123' }) });
const { accessToken } = await r.json();
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu-compositing', '--disable-gpu-rasterization', '--force-color-profile=srgb', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
await page.setCookie({ name: 'kx_session', value: accessToken, domain: 'localhost', path: '/' });
await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((res) => setTimeout(res, 800));
if (js) { const m = await import(pathToFileURL(js).href); await m.default(page); await new Promise((res) => setTimeout(res, 1200)); }
await page.screenshot({ path: out });
console.log(await page.evaluate(() => location.pathname + location.search + ' H=' + document.documentElement.scrollHeight));
await browser.close();
