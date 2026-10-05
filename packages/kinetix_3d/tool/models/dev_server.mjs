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
    const path = normalize(join(root, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!path.startsWith(root)) throw new Error('outside');
    const body = await readFile(path);
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
