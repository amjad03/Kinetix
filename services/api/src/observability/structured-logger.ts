import type { LoggerService } from '@nestjs/common';
import { currentContext } from './request-context.js';

type Level = 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';
const LEVEL_NAME: Record<Level, string> = { fatal: 'fatal', error: 'error', warn: 'warn', log: 'info', debug: 'debug', verbose: 'trace' };

/**
 * One JSON object per line with the request id, trace id, tenant and user of the request being
 * served (LOG_FORMAT=json). Outside a request those fields are simply absent.
 */
export class StructuredLogger implements LoggerService {
  constructor(private readonly write: (line: string) => void = (l) => process.stdout.write(l + '\n')) {}

  private emit(level: Level, message: unknown, params: unknown[]): void {
    let context: string | undefined;
    let stack: string | undefined;
    const rest = [...params];
    // Nest passes the context name last; errors pass a stack before it.
    if (typeof rest.at(-1) === 'string' && rest.length) context = rest.pop() as string;
    if (level === 'error' && typeof rest[0] === 'string') stack = rest.shift() as string;
    const c = currentContext();
    const line: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: LEVEL_NAME[level],
      ...(context ? { context } : {}),
      message: message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message),
      ...(c ? { requestId: c.requestId, traceId: c.traceId, ...(c.tenantId ? { tenantId: c.tenantId } : {}), ...(c.userId ? { userId: c.userId } : {}) } : {}),
      ...(stack || message instanceof Error ? { stack: stack ?? (message as Error).stack } : {}),
      pid: process.pid,
    };
    this.write(JSON.stringify(line));
  }

  log(m: unknown, ...p: unknown[]) {
    this.emit('log', m, p);
  }
  error(m: unknown, ...p: unknown[]) {
    this.emit('error', m, p);
  }
  warn(m: unknown, ...p: unknown[]) {
    this.emit('warn', m, p);
  }
  debug(m: unknown, ...p: unknown[]) {
    this.emit('debug', m, p);
  }
  verbose(m: unknown, ...p: unknown[]) {
    this.emit('verbose', m, p);
  }
  fatal(m: unknown, ...p: unknown[]) {
    this.emit('fatal', m, p);
  }
}
