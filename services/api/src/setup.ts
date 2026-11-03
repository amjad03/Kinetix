import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpException, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RateLimiter } from './common/rate-limiter.js';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCodeFilter } from './common/error-codes.js';
import { ENV, type Env } from './config/env.js';
import { observabilityMiddleware, TRACER } from './observability/observability.js';
import type { Tracer } from './observability/tracer.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';

/** Settings shared by the server and the e2e tests. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  // Graceful shutdown on SIGTERM: sockets are closed, running jobs finish, then the database and Redis.
  app.enableShutdownHooks();
  // Request id, trace context, metrics and an access log line per request (observability/).
  const tracer = app.get<Tracer>(TRACER);
  app.use(observabilityMiddleware(tracer, env.LOG_FORMAT === 'json' ? (line) => process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', ...line }) + '\n') : () => undefined));
  // Bearer tokens, no cookies: any origin is harmless in development; production lists the ERP and portals (CORS_ORIGINS).
  app.enableCors(env.CORS_ORIGINS.length ? { origin: env.CORS_ORIGINS, maxAge: 600 } : undefined);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // Behind a load balancer the client IP (per-IP rate limits) comes from X-Forwarded-For.
  if (env.TRUST_PROXY !== undefined) app.set('trust proxy', env.TRUST_PROXY);
  // Unauthenticated public pages and forms (admission forms, verification, recruiter portal): a per-IP budget.
  app.use('/v1/public', publicRateLimit(app.get(RateLimiter), env.PUBLIC_PER_IP_PER_MINUTE));
  // More than one API instance: socket.io rooms span instances through Redis.
  if (env.REDIS_URL) app.useWebSocketAdapter(new RedisIoAdapter(app, env.REDIS_URL));
  // Saved whiteboards are JSON stroke data; a busy multi-page lesson is a few MB.
  app.useBodyParser('json', { limit: '8mb' });
  // Bulk import (import/): a CSV body, kept as bytes so the import can refuse text that is not UTF-8.
  app.useBodyParser('raw', { type: ['text/csv', 'application/csv', 'application/vnd.ms-excel'], limit: '6mb' });
  serveModels(app, env);
  // Every error carries a stable `code` the apps can translate.
  app.useGlobalFilters(new ErrorCodeFilter(app.get(HttpAdapterHost).httpAdapter));
}

/** Pages the API serves to be framed or to run their own scripts: LMS launches, SCORM packages, simulations, shared notes, Swagger. */
const OWN_PAGE = /^\/(v1\/(lti|scorm|content\/sims|class-notes|auth\/sso)|docs|assets)(\/|$)/;

/**
 * Headers on every answer: HTTPS only (HSTS), no MIME sniffing, no referrer, no framing and no active content for the JSON
 * API, and no caching of signed-in answers unless the handler says otherwise (photos, model files).
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!OWN_PAGE.test(req.path)) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
  }
  if (req.headers.authorization) res.setHeader('Cache-Control', 'no-store');
  next();
}

/** 429 (code RATE_LIMITED) once one client IP has made more than `perMinute` requests to the public pages in a minute. */
export function publicRateLimit(limiter: RateLimiter, perMinute: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    limiter.hit(`public-ip:${req.ip}`, perMinute, 60_000).then(
      () => next(),
      (e: unknown) => {
        if (!(e instanceof HttpException)) return next(e);
        res.status(e.getStatus()).json({ ...(e.getResponse() as object), code: 'RATE_LIMITED' });
      },
    );
  };
}

/**
 * The downloadable 3D models at /assets/models/<id>.glb and <id>.json, public like the GitHub
 * copy they mirror, so boards on a school network fetch them from their own server first.
 */
export function serveModels(app: NestExpressApplication, env: Env): void {
  const dir = resolve(process.cwd(), env.MODELS_DIR);
  if (!existsSync(dir)) {
    new Logger('Models').warn(`3D models folder ${dir} not found; boards will download models from GitHub (set MODELS_DIR)`);
    return;
  }
  app.useStaticAssets(dir, {
    prefix: '/assets/models/',
    index: false,
    dotfiles: 'deny',
    maxAge: '7d',
    setHeaders: (res, path) => {
      if (path.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
      // The board's model viewer runs in a WebView on another origin.
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  });
}
