// Development: the library pictures of the narrated scenes,
// assets/viewer3d/thumbs/scene_<id>.jpg (720 × 540), each at the step its
// script names as `thumb`, without labels or caption. Needs the dev server
// (node dev_server.mjs) and Playwright's Chromium:
//
//   PLAYWRIGHT_BROWSERS_PATH=... [PLAYWRIGHT_MODULE=.../playwright/index.mjs] node scene_thumbs.mjs [id ...]
// PLAYWRIGHT_MODULE: where Playwright is, if it is not installed here (a global install).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenes } from './src/scenes/index.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '../../assets/viewer3d/thumbs');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
await page.addInitScript(() => {
  window.__frames = 0;
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (f) => raf((t) => {
    window.__frames++;
    f(t);
  });
});
for (const id of ids) {
  const s = scenes[id].script;
  const thumb = s.thumb || { step: s.steps[0].id, u: 0.5 };
  const i = Math.max(0, s.steps.findIndex((x) => x.id === thumb.step));
  await page.goto(`http://127.0.0.1:3681/index.html?scene=${id}&autoplay=0&step=${i}&u=${thumb.u ?? 0.5}`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.__kxSteps, null, { timeout: 300000 });
  await page.evaluate(() => window.kx.cmd({ cmd: 'labels', mode: 'none' }));
  const f0 = await page.evaluate(() => window.__frames);
  await page.waitForFunction((f) => window.__frames > f + 3, f0, { timeout: 300000, polling: 500 });
  await page.screenshot({ path: join(out, `scene_${id}.jpg`), type: 'jpeg', quality: 82, timeout: 300000 });
  console.log('saved', id);
}
await browser.close();
