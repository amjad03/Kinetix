// Frame-exact renderer. Serves the repo over http (the 3D viewer needs it), runs N Chrome workers on frame ranges.
//   node render.mjs --stills 3,20,40      -> renders/still-<t>.jpg
//   node render.mjs [--workers 4]         -> frames/NNNNN.jpg, then ../../dist/zynetix-promo.mp4 (needs audio/mix.wav)
import puppeteer from 'puppeteer-core';
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const FPS = 30, TL = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json'), 'utf8'));
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const types = { html: 'text/html', js: 'text/javascript', json: 'application/json', ttf: 'font/ttf', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', glb: 'model/gltf-binary', css: 'text/css' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[p.split('.').pop()] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(0);
const PORT = server.address().port;

async function open() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu-compositing', '--disable-gpu-rasterization', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pageerror', (e.stack||e.message).slice(0,500)));
  page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 200), m.location()?.url); });
  await page.goto(`http://localhost:${PORT}/marketing/promo/compose/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.ready);
  const cdp = await page.target().createCDPSession();
  const shot = async q => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: q })).data, 'base64');
  return { browser, page, shot };
}

if (args.includes('--stills')) {
  const { browser, page, shot } = await open();
  fs.mkdirSync(path.join(HERE, 'renders'), { recursive: true });
  for (const t of opt('--stills').split(',').map(Number)) {
    const t0 = Date.now();
    await page.evaluate(t => window.renderAt(t), t);
    const t1 = Date.now();
    fs.writeFileSync(path.join(HERE, `renders/still-${t}.jpg`), await shot(90));
    console.log('still', t, 'render', t1 - t0, 'shot', Date.now() - t1, 'ms');
  }
  await browser.close(); server.close(); process.exit(0);
}

const N = Math.round(TL.duration * FPS), WORKERS = +opt('--workers', 4);
const from = +opt('--from', 0), to = +opt('--to', N);
fs.mkdirSync(path.join(HERE, 'frames'), { recursive: true });
let next = from, done = 0; const t0 = Date.now();
const CH = 30; // chunks keep each worker's scenes (and WebGL contexts) local in time
async function worker(w) {
  const { browser, page, shot } = await open();
  for (;;) {
    const a = next; if (a >= to) break; next += CH;
    for (let f = a; f < Math.min(a + CH, to); f++) {
      if (fs.existsSync(path.join(HERE, `frames/${String(f).padStart(5, '0')}.jpg`))) { done++; continue; }
      await page.evaluate(t => window.renderAt(t), f / FPS);
      fs.writeFileSync(path.join(HERE, `frames/${String(f).padStart(5, '0')}.jpg`), await shot(92));
      if (++done % 100 === 0) console.log(`${done}/${to - from} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  await browser.close();
}
await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
server.close();
if (!args.includes('--no-encode')) {
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  execSync(`ffmpeg -loglevel error -y -framerate ${FPS} -i ${HERE}/frames/%05d.jpg -i ${HERE}/audio/mix.wav -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart ${ROOT}/dist/zynetix-promo.mp4`, { stdio: 'inherit' });
  console.log('done', path.join(ROOT, 'dist/zynetix-promo.mp4'));
}
