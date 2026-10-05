// KINETIX code runner: compiles and runs C, C++ and Java for the code lab, behind the API
// (POST /v1/code/run). It is the only thing in its container, which has no network, a
// read-only file system except /tmp, a non-root user, no capabilities and a seccomp profile
// (docker-compose.yml, infra/docker/code-runner-seccomp.json, docs/operations/code-runner.md).
// Each program also runs under its own limits: CPU time, wall time, memory, processes, open
// files, file size, and output. No dependencies; Node 22.
//
// Protocol: POST /run {language: c|cpp|java, source, stdin} →
//   {status: ok|compile_error|runtime_error|timeout|memory_limit|output_limit, stdout, stderr,
//    compileOutput, exitCode, timeMs}
// GET /health → {ok, languages}. 503 {status: 'busy'} when the queue is full.
// Listens on CODE_RUNNER_SOCKET (a Unix socket, the default in compose) or PORT.

import { spawn } from 'node:child_process';
import { chmod, chown, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const LIMITS = {
  /** CPU seconds for the program (compilers get COMPILE_SECONDS). */
  cpuSeconds: num(env.RUN_CPU_SECONDS, 2),
  /** Wall-clock milliseconds for the program, e.g. a program waiting for input that never comes. */
  wallMs: num(env.RUN_WALL_MS, 5000),
  compileSeconds: num(env.COMPILE_SECONDS, 15),
  /** Address space for C and C++ programs, bytes. */
  memoryBytes: num(env.RUN_MEMORY_MB, 256) * 1024 * 1024,
  /** Java heap; the JVM itself needs more address space (JAVA_ADDRESS_MB). */
  javaHeapMb: num(env.JAVA_HEAP_MB, 128),
  javaAddressMb: num(env.JAVA_ADDRESS_MB, 2048),
  /** stdout + stderr, bytes; the program is killed past it. */
  outputBytes: num(env.RUN_OUTPUT_BYTES, 64 * 1024),
  /** Largest file a program may write in its /tmp directory. */
  fileBytes: num(env.RUN_FILE_BYTES, 1024 * 1024),
  processes: num(env.RUN_PROCESSES, 128),
  sourceBytes: 64 * 1024,
  stdinBytes: 16 * 1024,
  /** Programs at once, and waiting. */
  concurrency: num(env.RUN_CONCURRENCY, 2),
  queue: num(env.RUN_QUEUE, 16),
};

const LANGUAGES = ['c', 'cpp', 'java'];

/** A small JVM that fits in JAVA_ADDRESS_MB of address space and starts fast. */
const JVM = ['-XX:CompressedClassSpaceSize=64m', '-XX:ReservedCodeCacheSize=32m', '-XX:MaxMetaspaceSize=128m', '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-XX:-UsePerfData'];

/** A child with limits (prlimit), in its own process group, with a bare environment. */
function exec(cmd, args, { cwd, stdin = '', cpu, wallMs, as, nofile = 64, outputBytes }) {
  return new Promise((resolve) => {
    const limits = [`--cpu=${cpu}:${cpu + 1}`, `--as=${as}`, `--fsize=${LIMITS.fileBytes}`, `--nproc=${LIMITS.processes}`, `--nofile=${nofile}`, '--core=0'];
    const started = Date.now();
    const child = spawn('prlimit', [...limits, '--', cmd, ...args], {
      cwd,
      detached: true,
      ...jobUser,
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: cwd, TMPDIR: cwd, LANG: 'C.UTF-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', size = 0, why = null;
    const kill = (reason) => {
      why ??= reason;
      killGroup(child.pid);
    };
    const take = (which) => (chunk) => {
      size += chunk.length;
      if (size > outputBytes) return kill('output');
      if (which === 'out') stdout += chunk; else stderr += chunk;
    };
    child.stdout.on('data', take('out'));
    child.stderr.on('data', take('err'));
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
    const timer = setTimeout(() => kill('wall'), wallMs);
    child.on('error', (e) => {
      stderr += String(e);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // Any stragglers (a forked child) go with the group.
      killGroup(child.pid);
      resolve({ code, signal, stdout, stderr, why, ms: Date.now() - started });
    });
  });
}

/**
 * In the container the runner is not root, and every program runs as its user under the
 * limits. Run as root (a developer machine, the API's real-runner test), programs run as
 * nobody instead, since RLIMIT_NPROC does not bind root.
 */
const jobUser = process.getuid?.() === 0 ? { uid: num(env.RUNNER_JOB_UID, 65534), gid: num(env.RUNNER_JOB_GID, 65534) } : {};

/** Kills a process group, again while a fork bomb is still making members. */
function killGroup(pgid) {
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(-pgid, 'SIGKILL');
    } catch {
      return;
    }
  }
}

const out = (o) => ({ stdout: '', stderr: '', compileOutput: '', exitCode: null, timeMs: 0, ...o });

/** Compiles and runs one program. */
export async function runJob({ language, source, stdin = '' }) {
  const dir = await mkdtemp(join(tmpdir(), 'job-'));
  await chmod(dir, 0o700);
  if (jobUser.uid !== undefined) await chown(dir, jobUser.uid, jobUser.gid);
  try {
    let file, compile, run;
    if (language === 'java') {
      // The public class names the file (Main by default).
      const cls = /public\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/.exec(source)?.[1] ?? 'Main';
      file = `${cls}.java`;
      compile = ['javac', [...JVM.map((f) => `-J${f}`), '-J-Xmx256m', '-encoding', 'UTF-8', '-nowarn', file]];
      run = ['java', [...JVM, `-Xmx${LIMITS.javaHeapMb}m`, '-Xss8m', '-cp', '.', cls]];
    } else {
      file = language === 'c' ? 'main.c' : 'main.cpp';
      const cc = language === 'c' ? ['gcc', ['-std=c17', '-O1', '-pipe', '-o', 'main', file, '-lm']] : ['g++', ['-std=c++17', '-O1', '-pipe', '-o', 'main', file]];
      compile = cc;
      run = ['./main', []];
    }
    await writeFile(join(dir, file), source);
    if (jobUser.uid !== undefined) await chown(join(dir, file), jobUser.uid, jobUser.gid);
    const big = LIMITS.javaAddressMb * 1024 * 1024;
    const c = await exec(compile[0], compile[1], { cwd: dir, cpu: LIMITS.compileSeconds, wallMs: LIMITS.compileSeconds * 2000, as: big, nofile: 256, outputBytes: LIMITS.outputBytes });
    if (c.code !== 0) {
      const msg = c.why === 'wall' || c.signal === 'SIGXCPU' ? 'The compiler took too long.' : c.stderr + c.stdout;
      return out({ status: 'compile_error', compileOutput: msg, exitCode: c.code, timeMs: c.ms });
    }
    const java = language === 'java';
    const r = await exec(run[0], run[1], {
      cwd: dir,
      stdin,
      cpu: LIMITS.cpuSeconds,
      wallMs: LIMITS.wallMs + (java ? 1500 : 0),
      as: java ? big : LIMITS.memoryBytes,
      nofile: java ? 256 : 64,
      outputBytes: LIMITS.outputBytes,
    });
    const memory = /OutOfMemoryError|std::bad_alloc|Cannot allocate memory/.test(r.stderr) || (java && /Could not reserve enough space/.test(r.stdout + r.stderr));
    const status =
      r.why === 'output' ? 'output_limit'
      : r.why === 'wall' || r.signal === 'SIGXCPU' || (r.signal === 'SIGKILL' && r.ms >= LIMITS.cpuSeconds * 1000) ? 'timeout'
      : memory ? 'memory_limit'
      : r.code === 0 ? 'ok'
      : 'runtime_error';
    let stderr = r.stderr;
    if (r.signal === 'SIGSEGV') stderr += 'Segmentation fault (an invalid memory access, e.g. a bad pointer or array index)\n';
    else if (r.signal === 'SIGFPE') stderr += 'Floating point exception (e.g. division by zero)\n';
    else if (r.signal === 'SIGABRT' && !memory) stderr += 'Aborted\n';
    return out({ status, stdout: r.stdout, stderr, exitCode: r.code, timeMs: r.ms });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** At most LIMITS.concurrency jobs at once; LIMITS.queue more wait. */
let active = 0;
const waiting = [];
async function queued(fn) {
  if (active >= LIMITS.concurrency) {
    if (waiting.length >= LIMITS.queue) return null;
    await new Promise((r) => waiting.push(r));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function tokenOk(req) {
  const want = env.CODE_RUNNER_TOKEN;
  if (!want) return true;
  const got = Buffer.from(String(req.headers['x-runner-token'] ?? ''));
  const exp = Buffer.from(want);
  return got.length === exp.length && timingSafeEqual(got, exp);
}

function reply(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

export function createRunnerServer() {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { ok: true, languages: LANGUAGES });
    if (req.method !== 'POST' || req.url !== '/run') return reply(res, 404, { error: 'not found' });
    if (!tokenOk(req)) return reply(res, 401, { error: 'unauthorised' });
    let body = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMITS.sourceBytes + LIMITS.stdinBytes + 4096) req.destroy();
      else body += c;
    });
    req.on('end', async () => {
      let job;
      try {
        job = JSON.parse(body);
      } catch {
        return reply(res, 400, { error: 'bad json' });
      }
      if (!LANGUAGES.includes(job.language) || typeof job.source !== 'string' || job.source.length > LIMITS.sourceBytes || typeof (job.stdin ?? '') !== 'string' || (job.stdin ?? '').length > LIMITS.stdinBytes) {
        return reply(res, 400, { error: 'bad job' });
      }
      try {
        const result = await queued(() => runJob(job));
        if (!result) return reply(res, 503, { status: 'busy' });
        reply(res, 200, result);
      } catch (e) {
        reply(res, 500, { error: String(e) });
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createRunnerServer();
  const socket = env.CODE_RUNNER_SOCKET;
  if (socket) {
    await unlink(socket).catch(() => {});
    server.listen(socket, async () => {
      // The API runs as another user in another container.
      await chmod(socket, 0o666);
      console.log(`code runner on ${socket}`);
    });
  } else {
    const port = num(env.PORT, 8080);
    server.listen(port, () => console.log(`code runner on :${port}`));
  }
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
}
