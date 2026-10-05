import { request } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ServiceUnavailableException } from '@nestjs/common';

export const RUN_LANGUAGES = ['c', 'cpp', 'java'] as const;
export type RunLanguage = (typeof RUN_LANGUAGES)[number];

export interface RunJob {
  language: RunLanguage;
  source: string;
  stdin: string;
}

export type RunStatus = 'ok' | 'compile_error' | 'runtime_error' | 'timeout' | 'memory_limit' | 'output_limit';

export interface RunOutcome {
  status: RunStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  timeMs: number;
}

export const RUNNER_UNAVAILABLE = 'The code runner is not available on this server';
export const RUNNER_BUSY = 'The code runner is busy. Try again in a moment.';

/** Compiles and runs C, C++ and Java (services/code-runner). Tests replace it with a fake. */
export abstract class CodeRunnerClient {
  abstract run(job: RunJob): Promise<RunOutcome>;
}

/** No runner configured (CODE_RUNNER_URL unset). */
export class NoCodeRunner extends CodeRunnerClient {
  async run(): Promise<RunOutcome> {
    throw new ServiceUnavailableException(RUNNER_UNAVAILABLE);
  }
}

const STATUSES: RunStatus[] = ['ok', 'compile_error', 'runtime_error', 'timeout', 'memory_limit', 'output_limit'];
const MAX_TEXT = 64 * 1024;
const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');

/** The runner's answer, checked: only the fields and statuses the apps know. */
export function readOutcome(body: unknown): RunOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!STATUSES.includes(b.status as RunStatus)) throw new ServiceUnavailableException(RUNNER_UNAVAILABLE);
  return {
    status: b.status as RunStatus,
    stdout: text(b.stdout),
    stderr: text(b.stderr),
    compileOutput: text(b.compileOutput),
    exitCode: typeof b.exitCode === 'number' ? b.exitCode : null,
    timeMs: typeof b.timeMs === 'number' ? Math.round(b.timeMs) : 0,
  };
}

/**
 * The runner over HTTP: on a Unix socket (`unix:/run/kx-runner/runner.sock`, docker-compose,
 * where the runner has no network at all) or TCP (`http://code-runner…:8080`, ECS).
 */
export class HttpCodeRunner extends CodeRunnerClient {
  constructor(
    private readonly url: string,
    private readonly token: string | undefined,
    private readonly timeoutMs: number,
  ) {
    super();
  }

  run(job: RunJob): Promise<RunOutcome> {
    const body = JSON.stringify(job);
    const unix = this.url.startsWith('unix:');
    const target = unix ? null : new URL('/run', this.url);
    const send = target?.protocol === 'https:' ? httpsRequest : request;
    return new Promise<RunOutcome>((resolve, reject) => {
      const req = send(
        {
          ...(unix ? { socketPath: this.url.slice('unix:'.length), path: '/run' } : { hostname: target!.hostname, port: target!.port, path: '/run' }),
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(this.token ? { 'x-runner-token': this.token } : {}) },
          timeout: this.timeoutMs,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c: string) => {
            if (data.length < 4 * MAX_TEXT) data += c;
          });
          res.on('end', () => {
            if (res.statusCode === 503) return reject(new ServiceUnavailableException(RUNNER_BUSY));
            if (res.statusCode !== 200) return reject(new ServiceUnavailableException(RUNNER_UNAVAILABLE));
            try {
              resolve(readOutcome(JSON.parse(data)));
            } catch (e) {
              reject(e instanceof ServiceUnavailableException ? e : new ServiceUnavailableException(RUNNER_UNAVAILABLE));
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', () => reject(new ServiceUnavailableException(RUNNER_UNAVAILABLE)));
      req.end(body);
    });
  }
}
