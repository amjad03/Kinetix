import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCodeFilter } from './common/error-codes.js';
import { ENV, type Env } from './config/env.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';

/** Settings shared by the server and the e2e tests. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  // Graceful shutdown on SIGTERM: sockets are closed, running jobs finish, then the database and Redis.
  app.enableShutdownHooks();
  app.enableCors();
  // Behind a load balancer the client IP (per-IP rate limits) comes from X-Forwarded-For.
  if (env.TRUST_PROXY !== undefined) app.set('trust proxy', env.TRUST_PROXY);
  // More than one API instance: socket.io rooms span instances through Redis.
  if (env.REDIS_URL) app.useWebSocketAdapter(new RedisIoAdapter(app, env.REDIS_URL));
  // Saved whiteboards are JSON stroke data; a busy multi-page lesson is a few MB.
  app.useBodyParser('json', { limit: '8mb' });
  // Every error carries a stable `code` the apps can translate.
  app.useGlobalFilters(new ErrorCodeFilter(app.get(HttpAdapterHost).httpAdapter));
}
