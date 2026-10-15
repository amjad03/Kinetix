// Records the real Zynetix 3D viewer (packages/zynetix_3d/assets/viewer3d, the page the board shows full screen)
// frame by frame: the page's requestAnimationFrame is stepped by us, so camera moves are exact.
//   node record_v3d.mjs  ->  clips/<id>.mp4 + clips/<id>.json (marks)
import puppeteer from '../../promo/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../..');
const SRC = path.join(ROOT, 'packages/zynetix_3d/assets/viewer3d');
const BUILD = path.join(HERE, 'build');
fs.rmSync(BUILD, { recursive: true, force: true });
fs.cpSync(SRC, BUILD, { recursive: true });
let html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
html = html.replace('</head>', `<style>@font-face{font-family:Deva;src:url(/packages/zynetix_ui/fonts/NotoSansDevanagari-500.ttf)}@font-face{font-family:Knda;src:url(/packages/zynetix_ui/fonts/NotoSansKannada-500.ttf)}@font-face{font-family:Inter;src:url(/packages/zynetix_ui/fonts/Inter-500.ttf)}.label{font-family:Inter,Deva,Knda,sans-serif!important;font-size:20px!important}</style>
<script>window.__q=[];window.requestAnimationFrame=function(cb){__q.push(cb);return 1};window.__step=function(){var q=__q.splice(0),t=performance.now();q.forEach(function(cb){cb(t)})}</script></head>`);
fs.writeFileSync(path.join(BUILD, 'index.html'), html);
let js = fs.readFileSync(path.join(BUILD, 'viewer.js'), 'utf8');
js = js.replace('view:s=>Zc(s.dir)', 'view:s=>Zc(s.dir,!!s.instant)');
if (!js.includes('Zc(s.dir,!!s.instant)')) throw new Error('viewer patch failed');
fs.writeFileSync(path.join(BUILD, 'viewer.js'), js);

const types = { html: 'text/html', js: 'text/javascript', json: 'application/json', ttf: 'font/ttf', jpg: 'image/jpeg', png: 'image/png', glb: 'model/gltf-binary', webp: 'image/webp', ktx2: 'image/ktx2' };
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  const p = u.startsWith('/v/') ? path.join(BUILD, u.slice(3)) : path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[p.split('.').pop()] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(0);
const PORT = server.address().port;
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  args: ['--no-sandbox', '--disable-gpu-compositing', '--disable-gpu-rasterization', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb', '--hide-scrollbars'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
fs.mkdirSync(path.join(HERE, 'clips'), { recursive: true });
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const C = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const S = (t, a, b) => C((t - a) / (b - a));

async function clip(id, title, segs) {
  // segs: [{model, dur, lang, fn(t) -> {az, el, explode, cut, labels, lang, pick}, marks:[[t,label]]}]
  const out = path.join(HERE, 'clips', id + '.mp4');
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const marks = []; let base = 0;
  for (const sg of segs) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('pageerror', e.message));
    const loaded = page.evaluateOnNewDocument(() => { window.__loaded = false; window.addEventListener('message', () => {}); });
    await page.goto(`http://localhost:${PORT}/v/index.html?model=${sg.model}&lang=${sg.lang || 'en'}`);
    // the page posts {event:'loaded'} to its parent (none here): poll for the viewer's canvas content instead
    for (let i = 0; i < 600; i++) { await page.evaluate(() => window.__step && window.__step()); const ok = await page.evaluate(() => !!document.querySelector('#stage canvas')); if (ok && i > 60) break; await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 3000));
    const cdp = await page.target().createCDPSession();
    const last = {};
    const cmd = c => page.evaluate(c => window.kx.cmd(c), c);
    const n = Math.round(sg.dur * 30);
    for (let f = 0; f < n; f++) {
      const t = f / 30, s = sg.fn(t);
      if (s.az !== undefined) { const a = s.az * Math.PI / 180, e = (s.el ?? 10) * Math.PI / 180; await cmd({ cmd: 'view', dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], instant: true }); }
      for (const k of ['explode', 'labels', 'lang', 'pick']) if (s[k] !== undefined && s[k] !== last[k]) { await cmd(k === 'explode' ? { cmd: 'explode', amount: s[k] } : k === 'labels' ? { cmd: 'labels', mode: s[k] } : k === 'lang' ? { cmd: 'lang', lang: s[k] } : { cmd: 'pick', part: s[k] }); last[k] = s[k]; }
      const cj = JSON.stringify(s.cut || null); if (cj !== JSON.stringify(last.cut || null)) { await cmd(s.cut ? { cmd: 'cut', ...s.cut } : { cmd: 'cut', mode: 'off' }); last.cut = s.cut; }
      await page.evaluate(() => window.__step());
      const buf = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 })).data, 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    for (const [t, l] of sg.marks || []) marks.push({ t: +(base + t).toFixed(3), label: l });
    base += sg.dur;
    await page.close();
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  fs.writeFileSync(path.join(HERE, 'clips', id + '.json'), JSON.stringify({ id, title, duration: base, marks }, null, 1));
  console.log('clip', id, base, 's');
}

// 1. The hook: a heart that turns, is cut in half, then taken apart.
await clip('v3d_heart', 'Human heart: turn, cut, take apart', [{ model: 'heart', dur: 11, marks: [[0.6, 'heart turning'], [3.6, 'cut in half'], [6.8, 'taken apart']], fn: t => {
  const cutOn = t >= 3.3 && t < 6.5;
  return { az: -35 + 14 * t, el: 10, cut: cutOn ? { mode: 'half', axis: 'z', at: 0 } : null, explode: t >= 6.5 ? .95 * ease(S(t, 6.5, 9.0)) : 0, labels: 'none' };
} }]);
// 2. A quick tour: brain, solar system, Taj Mahal.
await clip('v3d_tour', 'Brain, solar system, Taj Mahal', [
  { model: 'brain', dur: 3.4, marks: [[0.3, 'brain']], fn: t => ({ az: 20 + 40 * t, el: 14, labels: 'none' }) },
  { model: 'solar_system', dur: 3.4, marks: [[0.3, 'solar system']], fn: t => ({ az: 30 * t, el: 38, labels: 'none' }) },
  { model: 'taj_mahal', dur: 3.6, marks: [[0.3, 'Taj Mahal']], fn: t => ({ az: 25 + 30 * t, el: 16, labels: 'none' }) },
]);
// 3. Labels in three languages.
await clip('v3d_labels', 'Labels in English, Hindi, Kannada', [{ model: 'heart', dur: 12, marks: [[0.8, 'part picked'], [3.6, 'English labels'], [6.4, 'Hindi labels'], [9.2, 'Kannada labels']], fn: t => ({
  az: -15 + 4 * t, el: 8, labels: t >= 3.3 ? 'all' : 'picked', pick: t >= .5 && t < 3.3 ? 'left_ventricle' : null, lang: t >= 8.9 ? 'kn' : t >= 6.1 ? 'hi' : 'en' }) }]);
await browser.close(); server.close();
