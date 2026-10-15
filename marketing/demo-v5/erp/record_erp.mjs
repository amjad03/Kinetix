// Records real screen recordings of the ZYNETIX ERP (Soundarya demo tenant) for the product demo video.
// Prerequisites: API on :4000 and ERP (next start) on :3000 with the Soundarya seed loaded.
// Usage: node record_erp.mjs [clipId ...]   (no ids = all clips). Output: clips/<id>.mp4 + clips/<id>.json
import { launch, Clip } from './lib.mjs';
import { CLIPS } from './clips.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./clips', import.meta.url).pathname;
const PREVIEW = process.env.PREVIEW_DIR; // optional: write a 6-frame strip per clip here
const want = process.argv.slice(2);
const list = want.length ? CLIPS.filter((c) => want.includes(c.id)) : CLIPS;
const browser = await launch();
const results = [];
for (const def of list) {
  const clip = new Clip(browser, def);
  const t0 = Date.now();
  try {
    await clip.open();
    await def.run(clip);
    const meta = await clip.encode(OUT);
    results.push(`${def.id}: ${meta.duration}s, ${meta.marks.length} marks (${((Date.now() - t0) / 1000).toFixed(0)}s to record)`);
    console.log('OK', results.at(-1));
    if (PREVIEW) {
      mkdirSync(PREVIEW, { recursive: true });
      const n = 8, d = meta.duration;
      const sel = Array.from({ length: n }, (_, i) => `lt(prev_pts*TB\\,${((i + 0.5) * d / n).toFixed(2)})*gte(pts*TB\\,${((i + 0.5) * d / n).toFixed(2)})`).join('+');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/${def.id}.mp4`, '-vf', `select='${sel}',scale=960:540,tile=2x4`, '-frames:v', '1', `${PREVIEW}/${def.id}.jpg`]);
    }
  } catch (e) {
    console.log('FAIL', def.id, e.message);
    results.push(`${def.id}: FAILED ${e.message}`);
    try { await clip.page.screenshot({ path: `${PREVIEW ?? '/tmp'}/${def.id}_fail.png` }); } catch {}
  } finally {
    await clip.close().catch(() => {});
  }
}
await browser.close();
console.log(results.join('\n'));
