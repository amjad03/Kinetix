// Render compose/index.html frame by frame with system Chrome and stream JPEGs into ffmpeg.
//   node render.mjs                         -> ../../dist/kinetix-promo.mp4 (needs audio/mix_norm.wav)
//   node render.mjs --stills 3,20,40        -> renders/still-<t>.jpg for QA
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const stills = args.includes('--stills') ? args[args.indexOf('--stills') + 1].split(',').map(Number) : null;
const FPS = 30;
const TL = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json'), 'utf8'));
const OUT = path.resolve(HERE, '../../dist/kinetix-promo.mp4');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('file://' + path.join(HERE, 'compose/index.html'), { waitUntil: 'load' });
await page.evaluate(() => window.ready);
const cdp = await page.target().createCDPSession();
const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true })).data, 'base64');

if (stills) {
  fs.mkdirSync(path.join(HERE, 'renders'), { recursive: true });
  for (const t of stills) {
    await page.evaluate((t) => window.renderAt(t), t);
    fs.writeFileSync(path.join(HERE, `renders/still-${t}.jpg`), await shot());
  }
  await browser.close();
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', path.join(HERE, 'audio/mix_norm.wav'),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = Math.round(TL.duration * FPS);
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.renderAt(t), f / FPS);
  const buf = await shot();
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) console.log(`frame ${f}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('done', OUT);
