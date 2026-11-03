import { type ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { currentContext } from './request-context.js';

/** What leaves the process for an error: ids and code location only (no request body, query, names, phones or tokens). */
export interface ErrorReport {
  timestamp: string;
  service: string;
  release?: string;
  level: 'error' | 'fatal';
  name: string;
  message: string;
  stack: string[];
  method?: string;
  route?: string;
  status?: number;
  requestId?: string;
  traceId?: string;
  tenantId?: string;
  userId?: string;
}

/** Removes things that look like secrets or personal data from an error message before it is sent. */
export function scrub(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[jwt]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?\d[\d -]{8,}\d/g, '[number]')
    .replace(/(postgres(ql)?|rediss?):\/\/[^\s'"]+/gi, '[url]')
    .slice(0, 500);
}

/**
 * The error tracking hook: unexpected errors (5xx and anything that is not an HttpException) go to ERROR_WEBHOOK_URL as one
 * JSON object each (a Sentry/GlitchTip relay, an n8n flow, a Slack incoming webhook behind a small lambda). At most
 * `perMinute` reports a minute, so an outage cannot flood the receiver. Unset: errors are only logged.
 */
export class ErrorReporter {
  private readonly log = new Logger('ErrorReporter');
  private window = { start: 0, sent: 0 };

  constructor(
    private readonly url: string | undefined,
    private readonly service = 'zynetix-api',
    private readonly release = process.env.RELEASE ?? process.env.GIT_SHA,
    private readonly perMinute = 60,
    private readonly send: (url: string, body: string) => Promise<unknown> = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(3000) }),
  ) {}

  report(error: unknown, extra: { level?: 'error' | 'fatal'; req?: Request; status?: number } = {}): ErrorReport | undefined {
    const e = error instanceof Error ? error : new Error(String(error));
    const ctx = currentContext();
    const r: ErrorReport = {
      timestamp: new Date().toISOString(),
      service: this.service,
      ...(this.release ? { release: this.release } : {}),
      level: extra.level ?? 'error',
      name: e.name,
      message: scrub(e.message),
      stack: (e.stack ?? '').split('\n').slice(1, 11).map((l) => l.trim().replace(/\(.*node_modules\//, '(node_modules/')),
      ...(extra.req ? { method: extra.req.method, route: extra.req.route?.path ? `${extra.req.baseUrl}${extra.req.route.path}` : 'unmatched' } : {}),
      ...(extra.status ? { status: extra.status } : {}),
      ...(ctx ? { requestId: ctx.requestId, traceId: ctx.traceId, tenantId: ctx.tenantId, userId: ctx.userId } : {}),
    };
    this.log.error(`${r.name}: ${r.message}${r.route ? ` (${r.method} ${r.route})` : ''}`, r.stack.join('\n'));
    if (!this.url) return r;
    const now = Date.now();
    if (now - this.window.start > 60_000) this.window = { start: now, sent: 0 };
    if (++this.window.sent > this.perMinute) return r;
    void this.send(this.url, JSON.stringify(r)).catch((err: Error) => this.log.warn(`error webhook failed: ${err.message}`));
    return r;
  }

  /** Unhandled promise rejections and uncaught exceptions of the process. */
  installProcessHooks(): void {
    process.on('unhandledRejection', (reason) => this.report(reason, { level: 'error' }));
    process.on('uncaughtExceptionMonitor', (err) => this.report(err, { level: 'fatal' }));
  }
}

/** Reports what the HTTP error filter does not handle: any error that is not an HttpException (the 500s). */
@Catch()
export class ReportingFilter extends BaseExceptionFilter {
  constructor(
    private readonly reporter: ErrorReporter,
    applicationRef?: ConstructorParameters<typeof BaseExceptionFilter>[0],
  ) {
    super(applicationRef);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && host.getType() === 'http') this.reporter.report(exception, { req: host.switchToHttp().getRequest<Request>(), status });
    return super.catch(exception, host);
  }
}
