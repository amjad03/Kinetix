// Zynetix school code box gateway: puts the code runner (server.mjs, which has no network
// and listens only on a Unix socket) on the school network for the boards, without giving the
// runner itself any network (infra/school-code-box/, docs/operations/school-code-box.md).
//
//   GET  /health                  → the runner's {ok, languages} plus {name, gateway}; open to
//                                   anyone on the network, so a board can find the box.
//   POST /run                     → the runner's /run; needs x-code-box-key when CODE_BOX_KEY
//                                   is set; RUN_PER_MINUTE runs per board address.
//   GET  /assets/pyodide/<v>/<f>  → Python for the boards' offline code lab (Pyodide's core
//                                   files, from PYODIDE_DIR), so boards get it from the box
//                                   instead of the internet.
//
// No dependencies; Node 22.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

/** The Pyodide files a board asks for (python_runtime.dart), and their types. */
const PYODIDE_FILES = {
  'pyodide.js': 'text/javascript; charset=utf-8',
  'pyodide.asm.js': 'text/javascript; charset=utf-8',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json; charset=utf-8',
};

function reply(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function same(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Forwards one request to the runner's Unix socket; resolves {status, body} or null when down. */
function upstream(socket, token, method, path, body, timeoutMs) {
  return new Promise((resolve) => {
    const req = request(
      { socketPath: socket, method, path, headers: { 'content-type': 'application/json', ...(token ? { 'x-runner-token': token } : {}), ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) } },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on('error', () => resolve(null));
    req.end(body);
  });
}

/**
 * The gateway. Options default to the environment: CODE_RUNNER_SOCKET, CODE_RUNNER_TOKEN,
 * CODE_BOX_KEY, CODE_BOX_NAME, RUN_PER_MINUTE (per board), PYODIDE_DIR.
 */
export function createGateway(o = {}) {
  const env = process.env;
  const socket = o.socket ?? env.CODE_RUNNER_SOCKET ?? '/run/kx-runner/runner.sock';
  const token = o.token ?? env.CODE_RUNNER_TOKEN;
  const key = o.key ?? env.CODE_BOX_KEY ?? '';
  const name = o.name ?? env.CODE_BOX_NAME ?? hostname();
  const perMinute = o.perMinute ?? num(env.RUN_PER_MINUTE, 30);
  const pyodideDir = o.pyodideDir ?? env.PYODIDE_DIR ?? '';
  const maxBody = 64 * 1024 + 16 * 1024 + 4096;
  const runTimeoutMs = o.runTimeoutMs ?? 60_000;
  const recent = new Map();

  function limited(ip) {
    const now = Date.now();
    const times = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (times.length >= perMinute) {
      recent.set(ip, times);
      return true;
    }
    times.push(now);
    recent.set(ip, times);
    if (recent.size > 5000) recent.clear();
    return false;
  }

  async function pyodide(req, res, file) {
    const type = PYODIDE_FILES[file];
    if (!pyodideDir || !type) return reply(res, 404, { error: 'not found' });
    const path = join(pyodideDir, file);
    try {
      const s = await stat(path);
      res.writeHead(200, { 'content-type': type, 'content-length': s.size, 'cache-control': 'public, max-age=604800' });
      createReadStream(path).pipe(res);
    } catch {
      reply(res, 404, { error: 'not found' });
    }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://box');
    if (req.method === 'GET' && url.pathname === '/health') {
      const up = await upstream(socket, token, 'GET', '/health', null, 3000);
      if (!up || up.status !== 200) return reply(res, 503, { ok: false, error: 'the code runner is not running' });
      let h;
      try {
        h = JSON.parse(up.body);
      } catch {
        return reply(res, 503, { ok: false });
      }
      return reply(res, 200, { ok: h.ok === true, languages: Array.isArray(h.languages) ? h.languages : [], name, gateway: 1, keyed: key !== '' });
    }
    const asset = /^\/assets\/pyodide\/[0-9][\w.-]*\/([\w.-]+)$/.exec(url.pathname);
    if (req.method === 'GET' && asset) return pyodide(req, res, asset[1]);
    if (req.method !== 'POST' || url.pathname !== '/run') return reply(res, 404, { error: 'not found' });
    if (key && !same(req.headers['x-code-box-key'], key)) return reply(res, 401, { error: 'wrong box key' });
    if (limited(req.socket.remoteAddress ?? '')) return reply(res, 429, { error: 'too many runs' });
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBody) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', async () => {
      if (tooBig) return reply(res, 413, { error: 'program too large' });
      const up = await upstream(socket, token, 'POST', '/run', Buffer.concat(chunks).toString('utf8'), runTimeoutMs);
      if (!up) return reply(res, 503, { error: 'the code runner is not running' });
      res.writeHead(up.status ?? 502, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(up.body) });
      res.end(up.body);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = num(process.env.GATEWAY_PORT, 8181);
  const server = createGateway();
  server.listen(port, () => console.log(`code box gateway on :${port}`));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
}
