import { randomUUID } from 'node:crypto';
import { Controller, Get, Inject, Module, UnauthorizedException, Headers, Header } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ENV, type Env } from '../config/env.js';
import { httpDuration, httpRequests, renderMetrics } from './metrics.js';
import { requestContext, type RequestContext } from './request-context.js';
import { newSpanId, newTraceId, parseTraceparent, Tracer } from './tracer.js';

export const TRACER = Symbol('TRACER');
const ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Express middleware (installed by configureApp): assigns the request id (the caller's
 * `x-request-id` when sane), joins or starts a trace, runs the rest of the request inside the
 * AsyncLocalStorage context, and on completion records the metrics, the span and one access log line.
 */
export function observabilityMiddleware(tracer: Tracer, log: (line: Record<string, unknown>) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const parent = parseTraceparent(req.headers['traceparent'] as string | undefined);
    const ctx: RequestContext = {
      requestId: typeof incoming === 'string' && ID.test(incoming) ? incoming : randomUUID(),
      traceId: parent?.traceId ?? newTraceId(),
      spanId: newSpanId(),
    };
    res.setHeader('x-request-id', ctx.requestId);
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const route = (req.route?.path as string | undefined) ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      httpRequests.inc({ method: req.method, route, status: `${Math.floor(res.statusCode / 100)}xx` });
      httpDuration.observe({ method: req.method, route }, ms / 1000);
      if (tracer.shouldSample(parent?.sampled)) {
        tracer.record({
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          parentSpanId: parent?.parentSpanId,
          name: `${req.method} ${route}`,
          startMs: start,
          endMs: start + ms,
          attributes: { 'http.method': req.method, 'http.route': route, 'http.status_code': res.statusCode, ...(ctx.tenantId ? { 'kinetix.tenant_id': ctx.tenantId } : {}), ...(ctx.userId ? { 'enduser.id': ctx.userId } : {}) },
          error: res.statusCode >= 500,
        });
      }
      if (route !== '/metrics' && route !== '/health') log({ message: 'request', method: req.method, route, status: res.statusCode, durationMs: ms, ...ctx });
    });
    requestContext.run(ctx, next);
  };
}

/** `GET /metrics` for Prometheus. With METRICS_TOKEN set it needs `Authorization: Bearer <token>`. */
@Controller()
export class MetricsController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(@Headers('authorization') authorization?: string): string {
    if (this.env.METRICS_TOKEN && authorization !== `Bearer ${this.env.METRICS_TOKEN}`) throw new UnauthorizedException('Metrics token required');
    return renderMetrics();
  }
}

@Module({
  controllers: [MetricsController],
  providers: [{ provide: TRACER, inject: [ENV], useFactory: (env: Env) => new Tracer(env.OTEL_EXPORTER_OTLP_ENDPOINT, env.OTEL_SERVICE_NAME, env.OTEL_TRACES_SAMPLER_ARG) }],
  exports: [TRACER],
})
export class ObservabilityModule {}
