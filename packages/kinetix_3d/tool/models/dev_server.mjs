// Development only: serves assets/viewer3d on http://127.0.0.1:3681 and
// saves snapshots the page POSTs to /__snap?name=… as PNG files in
// $SNAP_DIR (for checking the viewer without a visible browser).
//
// Open http://127.0.0.1:3681/__thumbs after building models: it opens each
// model in turn and saves a picture of it to assets/viewer3d/thumbs/<id>.jpg
// for the model library.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../assets/viewer3d');
const snaps = process.env.SNAP_DIR || '/tmp';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/__snap') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const data = Buffer.concat(chunks).toString().replace(/^data:image\/\w+;base64,/, '');
      const name = (url.searchParams.get('name') || 'snap').replace(/[^\w-]/g, '');
      await mkdir(snaps, { recursive: true });
      await writeFile(join(snaps, `${name}.png`), Buffer.from(data, 'base64'));
      res.writeHead(200).end('saved');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/__thumb') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const id = (url.searchParams.get('id') || '').replace(/[^\w-]/g, '');
      await mkdir(join(root, 'thumbs'), { recursive: true });
      await writeFile(join(root, 'thumbs', `${id}.jpg`), Buffer.from(Buffer.concat(chunks).toString(), 'base64'));
      res.writeHead(200).end('saved');
      return;
    }
    if (url.pathname === '/__thumbs') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(THUMBS);
      return;
    }
    // Checking models by eye without a browser window: /__shots?ids=a,b&views=front,side
    // saves <id>-<view>.png in $SNAP_DIR (run headless Chrome on it).
    if (url.pathname === '/__shots') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(SHOTS);
      return;
    }
    const path = normalize(join(root, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!path.startsWith(root)) throw new Error('outside');
    // Models downloaded on first use live in remote_models/, as the app's cache does.
    const remote = url.pathname.startsWith('/models/') ? normalize(join(root, '../../remote_models', url.pathname.slice(8))) : null;
    const body = await readFile(path).catch((e) => (remote ? readFile(remote) : Promise.reject(e)));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(3681, '127.0.0.1', () => console.log('viewer on http://127.0.0.1:3681'));

// The page that makes the library's pictures: each model at its first view,
// 360 x 270, as JPEG.
const THUMBS = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#16191e;color:#ccc;font:14px sans-serif">
<pre id="log"></pre><script type="module">
const log = (t) => (document.getElementById('log').textContent += t + '\\n');
const { models } = await (await fetch('/models/index.json')).json();
for (const m of models) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:720px;height:540px;border:0';
  f.src = '/index.html?model=' + m.id + '&ch=t';
  document.body.appendChild(f);
  const got = [];
  const on = (e) => { if (e.data && e.data.kx) got.push(JSON.parse(e.data.kx)); };
  addEventListener('message', on);
  for (let i = 0; i < 100 && !got.some((g) => g.event === 'loaded'); i++) await new Promise((r) => setTimeout(r, 100));
  const manifest = await (await fetch('/models/' + m.id + '.json')).json();
  if (manifest.thumb) f.contentWindow.kx.cmd({ cmd: 'variant', id: manifest.thumb });
  await new Promise((r) => setTimeout(r, 900));
  f.contentWindow.kx.cmd({ cmd: 'frames', frames: 4 });
  f.contentWindow.kx.cmd({ cmd: 'snapshot', maxWidth: 720 });
  for (let i = 0; i < 50 && !got.some((g) => g.event === 'snapshot'); i++) await new Promise((r) => setTimeout(r, 100));
  const png = got.find((g) => g.event === 'snapshot')?.png;
  removeEventListener('message', on);
  f.remove();
  if (!png) { log('failed: ' + m.id); continue; }
  const img = new Image();
  img.src = png;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 360; c.height = 270;
  c.getContext('2d').drawImage(img, 0, 0, 360, 270);
  const jpg = c.toDataURL('image/jpeg', 0.82).split(',')[1];
  await fetch('/__thumb?id=' + m.id, { method: 'POST', body: jpg });
  log('saved ' + m.id);
}
log('done');
</script>`;

// Pictures for checking models: each id at each of its first views (or the
// views asked for), with all labels when &labels=all, as PNG in $SNAP_DIR.
const SHOTS = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#16191e;color:#ccc;font:14px sans-serif">
<pre id="log"></pre><script type="module">
const q = new URLSearchParams(location.search);
const log = (t) => (document.getElementById('log').textContent += t + '\\n');
const ids = (q.get('ids') || '').split(',').filter(Boolean);
for (const id of ids) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:720px;border:0';
  f.src = '/index.html?model=' + id + '&ch=s&lang=' + (q.get('lang') || 'en');
  document.body.appendChild(f);
  const got = [];
  const on = (e) => { if (e.data && e.data.kx) got.push(JSON.parse(e.data.kx)); };
  addEventListener('message', on);
  for (let i = 0; i < 300 && !got.some((g) => g.event === 'loaded' || g.event === 'error'); i++) await new Promise((r) => setTimeout(r, 100));
  const err = got.find((g) => g.event === 'error');
  if (err) log('error ' + id + ': ' + err.message);
  const manifest = await (await fetch('/models/' + id + '.json')).json();
  const views = q.get('views') ? q.get('views').split(',') : (manifest.views || []).slice(0, 2).map((v) => v.id);
  const cmd = (c) => f.contentWindow.kx.cmd(c);
  if (q.get('variant')) cmd({ cmd: 'variant', id: q.get('variant') });
  if (q.get('anim')) cmd({ cmd: 'animate', id: q.get('anim') });
  if (q.get('labels')) cmd({ cmd: 'labels', mode: q.get('labels') });
  if (q.get('explode')) cmd({ cmd: 'explode', amount: Number(q.get('explode')) });
  if (q.get('slice')) { const s = manifest.slices.find((x) => x.id === q.get('slice')); if (s) cmd({ cmd: 'slice', normal: s.normal, offset: s.offset }); }
  for (const v of views.length ? views : ['default']) {
    const dir = (manifest.views || []).find((x) => x.id === v)?.dir;
    if (dir) cmd({ cmd: 'view', dir });
    await new Promise((r) => setTimeout(r, 1500));
    cmd({ cmd: 'frames', frames: 3 });
    got.length = 0;
    cmd({ cmd: 'snapshot', maxWidth: 960 });
    for (let i = 0; i < 50 && !got.some((g) => g.event === 'snapshot'); i++) await new Promise((r) => setTimeout(r, 100));
    const png = got.find((g) => g.event === 'snapshot')?.png;
    if (!png) { log('failed: ' + id + ' ' + v); continue; }
    await fetch('/__snap?name=' + id + '-' + v + (q.get('tag') || ''), { method: 'POST', body: png });
    log('saved ' + id + '-' + v);
    // &thumb=1: the first view is also the library picture (360 x 270 JPEG).
    if (q.get('thumb') && v === (views[0] || 'default')) {
      const img = new Image();
      img.src = png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 360; c.height = 270;
      const s = Math.max(360 / img.width, 270 / img.height);
      c.getContext('2d').drawImage(img, (360 - img.width * s) / 2, (270 - img.height * s) / 2, img.width * s, img.height * s);
      await fetch('/__thumb?id=' + id, { method: 'POST', body: c.toDataURL('image/jpeg', 0.82).split(',')[1] });
    }
  }
  removeEventListener('message', on);
  f.remove();
}
log('done');
document.title = 'done';
</script>`;
