import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
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
  app.enableCors();
  // Behind a load balancer the client IP (per-IP rate limits) comes from X-Forwarded-For.
  if (env.TRUST_PROXY !== undefined) app.set('trust proxy', env.TRUST_PROXY);
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
