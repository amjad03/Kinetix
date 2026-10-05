import type { INestApplication } from '@nestjs/common';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpCodeRunner, readOutcome, type RunJob } from '../src/code/code-runner.client.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

const TOKEN = 'runner-test-token';

/** A stand-in for services/code-runner that speaks its protocol. */
function fakeRunner() {
  const jobs: { job: RunJob; token: string | undefined }[] = [];
  let mode: 'ok' | 'busy' = 'ok';
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const job = JSON.parse(body) as RunJob;
      jobs.push({ job, token: req.headers['x-runner-token'] as string | undefined });
      if (mode === 'busy') {
        res.writeHead(503).end(JSON.stringify({ status: 'busy' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', stdout: `${job.language}:${job.stdin}`, stderr: '', compileOutput: '', exitCode: 0, timeMs: 7, secret: 'not passed on' }));
    });
  });
  return {
    jobs,
    server,
    setMode: (m: 'ok' | 'busy') => (mode = m),
    start: () => new Promise<string>((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
  };
}

describe('code runs (C, C++, Java) through the API', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const fake = fakeRunner();
  const saved = { ...process.env };
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let busy: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const run = (token: string | null, body: object) => {
    const r = http().post('/v1/code/run');
    return (token ? r.set('authorization', `Bearer ${token}`) : r).send(body);
  };
  const job = { language: 'c', source: 'int main(void) { return 0; }', stdin: '5' };

  beforeAll(async () => {
    Object.assign(process.env, { CODE_RUNNER_URL: await fake.start(), CODE_RUNNER_TOKEN: TOKEN, CODE_RUN_USER_PER_MINUTE: '4', CODE_RUN_TENANT_PER_MINUTE: '10' });
    t = await createTenant(owner);
    busy = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
  });

  afterAll(async () => {
    process.env = saved;
    await app.close();
    fake.server.close();
    await owner.end();
  });

  it('needs a signed-in teacher, student or board', async () => {
    await run(null, job).expect(401);
    const guardian = await login(t.slug, t.guardian.email!);
    await run(guardian, job).expect(403);
  });

  it('runs for a teacher, a student and a board, passing only the result on', async () => {
    const teacher = await login(t.slug, t.teacher.email!);
    const res = await run(teacher, job).expect(200);
    expect(res.body).toEqual({ status: 'ok', stdout: 'c:5', stderr: '', compileOutput: '', exitCode: 0, timeMs: 7 });
    expect(fake.jobs.at(-1)).toEqual({ job: { language: 'c', source: job.source, stdin: '5' }, token: TOKEN });

    const student = await login(t.slug, t.studentUser.email!);
    expect((await run(student, { language: 'java', source: 'class Main {}' }).expect(200)).body.stdout).toBe('java:');

    const paired = await pairBoard(app, t, teacher);
    paired.socket.disconnect();
    expect((await run(paired.boardToken, { ...job, language: 'cpp' }).expect(200)).body.stdout).toBe('cpp:5');
  });

  it('checks the job', async () => {
    const teacher = await login(t.slug, t.teacher2.email!);
    await run(teacher, { ...job, language: 'python' }).expect(400);
    await run(teacher, { ...job, source: '' }).expect(400);
    await run(teacher, { ...job, source: 'x'.repeat(64 * 1024 + 1) }).expect(400);
    await run(teacher, { ...job, stdin: 'x'.repeat(16 * 1024 + 1) }).expect(400);
  });

  it('limits each person, then each institution, per minute', async () => {
    const [a, b, c, d] = await Promise.all([busy.teacher, busy.teacher2, busy.principal, busy.studentUser].map((u) => login(busy.slug, u.email!)));
    for (let i = 0; i < 4; i++) await run(a, job).expect(200);
    const limited = await run(a, job).expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    for (let i = 0; i < 4; i++) await run(b, job).expect(200);
    // A run refused for the person does not count for the institution: 4 + 4 + 2 fill its 10.
    await run(c, job).expect(200);
    await run(d, job).expect(200);
    expect((await run(d, job).expect(429)).body.code).toBe('RATE_LIMITED');
    // Other institutions are not affected.
    await run(await login(other.slug, other.teacher.email!), job).expect(200);
  });

  it('says when the runner is busy or down', async () => {
    const student = await login(other.slug, other.studentUser.email!);
    fake.setMode('busy');
    expect((await run(student, job).expect(503)).body.code).toBe('CODE_RUNNER_BUSY');
    fake.setMode('ok');
    const down = new HttpCodeRunner('http://127.0.0.1:1', TOKEN, 2000);
    await expect(down.run(job as RunJob)).rejects.toThrow('The code runner is not available on this server');
  });

  it('passes on only known statuses, and caps output', () => {
    expect(() => readOutcome({ status: 'pwned' })).toThrow();
    const r = readOutcome({ status: 'output_limit', stdout: 'x'.repeat(100_000), exitCode: 'no', extra: 1 });
    expect(r.stdout.length).toBe(64 * 1024);
    expect(r.exitCode).toBeNull();
    expect(Object.keys(r).sort()).toEqual(['compileOutput', 'exitCode', 'status', 'stderr', 'stdout', 'timeMs']);
  });
});

/** The real services/code-runner, where gcc, g++, javac and prlimit are installed (CI images, dev machines). */
const has = (cmd: string) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const realRunner = has('gcc') && has('g++') && has('prlimit');

describe.skipIf(!realRunner)('the real code runner and its sandbox limits', () => {
  let proc: ChildProcess;
  let runner: HttpCodeRunner;

  beforeAll(async () => {
    const port = 18000 + Math.floor(Math.random() * 1000);
    const script = fileURLToPath(new URL('../../code-runner/server.mjs', import.meta.url));
    proc = spawn('node', [script], {
      env: { PATH: process.env.PATH, PORT: String(port), CODE_RUNNER_TOKEN: TOKEN, RUN_CPU_SECONDS: '1', RUN_WALL_MS: '3000', RUN_MEMORY_MB: '128', RUN_OUTPUT_BYTES: '4096' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise<void>((resolve) => proc.stdout!.once('data', () => resolve()));
    runner = new HttpCodeRunner(`http://127.0.0.1:${port}`, TOKEN, 30_000);
  });

  afterAll(() => {
    proc?.kill();
  });

  const c = (source: string, stdin = '') => runner.run({ language: 'c', source, stdin });

  it('compiles and runs C and C++ with input', async () => {
    const r = await c('#include <stdio.h>\nint main(void){int n;scanf("%d",&n);printf("%d\\n",n*n);return 0;}', '12');
    expect(r).toMatchObject({ status: 'ok', stdout: '144\n', exitCode: 0 });
    const cpp = await runner.run({ language: 'cpp', source: '#include <iostream>\nint main(){ std::cout << "hi" << std::endl; }', stdin: '' });
    expect(cpp).toMatchObject({ status: 'ok', stdout: 'hi\n' });
  });

  it('reports compile errors, crashes and exit codes', async () => {
    expect((await c('int main(void) { return x; }')).status).toBe('compile_error');
    const seg = await c('int main(void) { int *p = 0; return *p; }');
    expect(seg.status).toBe('runtime_error');
    expect(seg.stderr).toContain('Segmentation fault');
    expect(await c('int main(void) { return 3; }')).toMatchObject({ status: 'runtime_error', exitCode: 3 });
  });

  it('ends programs that spin, flood the output or eat memory', async () => {
    expect((await c('int main(void) { for (;;); }')).status).toBe('timeout');
    expect((await c('#include <unistd.h>\nint main(void) { sleep(30); }')).status).toBe('timeout');
    const flood = await c('#include <stdio.h>\nint main(void) { for (;;) puts("spam"); }');
    expect(flood.status).toBe('output_limit');
    expect(flood.stdout.length).toBeLessThanOrEqual(4096);
    expect((await runner.run({ language: 'cpp', source: '#include <vector>\nint main(){ std::vector<long> v; for(;;) v.push_back(1); }', stdin: '' })).status).toBe('memory_limit');
  });

  it('lets programs write only in their own scratch directory', async () => {
    const write = await c('#include <stdio.h>\nint main(void){ FILE *f = fopen("/etc/kx-test", "w"); printf("%s\\n", f ? "wrote" : "refused"); return 0; }');
    expect(write.stdout).toBe('refused\n');
  });

  it('refuses callers without the token', async () => {
    const stranger = new HttpCodeRunner(runner['url'], 'wrong', 5000);
    await expect(stranger.run({ language: 'c', source: 'int main(void){return 0;}', stdin: '' })).rejects.toThrow();
  });

  it.skipIf(!has('javac'))('runs Java, naming the file after its public class', async () => {
    const r = await runner.run({ language: 'java', source: 'import java.util.*;\npublic class Hello { public static void main(String[] a) { System.out.println(new Scanner(System.in).nextInt() * 2); } }', stdin: '21' });
    expect(r).toMatchObject({ status: 'ok', stdout: '42\n' });
    const oom = await runner.run({ language: 'java', source: 'import java.util.*; public class Main { public static void main(String[] a){ List<long[]> l = new ArrayList<>(); for(;;) l.add(new long[1 << 20]); } }', stdin: '' });
    expect(oom.status).toBe('memory_limit');
  });
});
