// node --test services/code-runner/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGateway } from '../gateway.mjs';
import { createRunnerServer, detectLanguages } from '../server.mjs';

const listen = (server, at) => new Promise((r) => server.listen(at, () => r(server)));
const close = (server) => new Promise((r) => server.close(() => r()));

async function setup(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'kx-box-'));
  const socket = join(dir, 'runner.sock');
  const seen = [];
  // A runner on the Unix socket that records what it is sent.
  const runner = await listen(
    createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, token: req.headers['x-runner-token'], body });
        res.setHeader('content-type', 'application/json');
        res.end(req.url === '/health' ? JSON.stringify({ ok: true, languages: ['c', 'cpp', 'java', 'python'] }) : JSON.stringify({ status: 'ok', stdout: 'hi\n', timeMs: 3 }));
      });
    }),
    socket,
  );
  const gateway = await listen(createGateway({ socket, token: 'runner-secret', name: 'lab-pc', ...options, pyodideDir: options.pyodideDir ?? dir }), 0);
  const base = `http://127.0.0.1:${gateway.address().port}`;
  return {
    base,
    seen,
    dir,
    async done() {
      await close(gateway);
      await close(runner);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

const run = (base, body, headers = {}) => fetch(`${base}/run`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('health says what the box runs, without a key', async () => {
  const box = await setup({ key: 'k' });
  try {
    const h = await (await fetch(`${box.base}/health`)).json();
    assert.deepEqual(h, { ok: true, languages: ['c', 'cpp', 'java', 'python'], name: 'lab-pc', gateway: 1, keyed: true });
    assert.equal(box.seen[0].token, 'runner-secret');
  } finally {
    await box.done();
  }
});

test('runs need the box key, and reach the runner with its token', async () => {
  const box = await setup({ key: 'k' });
  try {
    assert.equal((await run(box.base, { language: 'c', source: 'x' })).status, 401);
    assert.equal((await run(box.base, { language: 'c', source: 'x' }, { 'x-code-box-key': 'nope' })).status, 401);
    const ok = await run(box.base, { language: 'c', source: 'int main(){}', stdin: '1' }, { 'x-code-box-key': 'k' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { status: 'ok', stdout: 'hi\n', timeMs: 3 });
    const sent = box.seen.at(-1);
    assert.equal(sent.url, '/run');
    assert.equal(sent.token, 'runner-secret');
    assert.deepEqual(JSON.parse(sent.body), { language: 'c', source: 'int main(){}', stdin: '1' });
  } finally {
    await box.done();
  }
});

test('limits runs per board and refuses large programs', async () => {
  const box = await setup({ perMinute: 2 });
  try {
    assert.equal((await run(box.base, { language: 'c', source: 'a' })).status, 200);
    assert.equal((await run(box.base, { language: 'c', source: 'b' })).status, 200);
    assert.equal((await run(box.base, { language: 'c', source: 'c' })).status, 429);
  } finally {
    await box.done();
  }
  const big = await setup();
  try {
    assert.equal((await run(big.base, { language: 'c', source: 'x'.repeat(100_000) })).status, 413);
  } finally {
    await big.done();
  }
});

test('serves Pyodide files for offline Python, and nothing else', async () => {
  const box = await setup();
  try {
    await writeFile(join(box.dir, 'pyodide.js'), 'js');
    const r = await fetch(`${box.base}/assets/pyodide/0.27.7/pyodide.js`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'js');
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${box.base}/assets/pyodide/0.27.7/runner.sock`)).status, 404);
    assert.equal((await fetch(`${box.base}/assets/pyodide/0.27.7/..%2Frunner.sock`)).status, 404);
    assert.equal((await fetch(`${box.base}/assets/pyodide/0.27.7/python_stdlib.zip`)).status, 404, 'not there yet');
  } finally {
    await box.done();
  }
});

test('says so when the runner is down', async () => {
  const gateway = await listen(createGateway({ socket: join(tmpdir(), 'kx-no-such.sock') }), 0);
  try {
    const base = `http://127.0.0.1:${gateway.address().port}`;
    assert.equal((await fetch(`${base}/health`)).status, 503);
    assert.equal((await run(base, { language: 'c', source: 'x' })).status, 503);
  } finally {
    await close(gateway);
  }
});

test('the runner runs Python and SQL where the image has them', async () => {
  assert.deepEqual(detectLanguages(undefined, () => false), ['c', 'cpp', 'java']);
  assert.deepEqual(detectLanguages(undefined, (p) => p.endsWith('python3')), ['c', 'cpp', 'java', 'python']);
  assert.deepEqual(detectLanguages(undefined, () => true), ['c', 'cpp', 'java', 'python', 'sql']);
  assert.deepEqual(detectLanguages('c, java, ruby'), ['c', 'java']);

  // An unknown language is refused before anything runs.
  const server = await listen(createRunnerServer(), 0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const h = await (await fetch(`${base}/health`)).json();
    assert.ok(h.languages.includes('c'));
    assert.equal((await run(base, { language: 'ruby', source: 'puts 1' })).status, 400);
  } finally {
    await close(server);
  }
});
