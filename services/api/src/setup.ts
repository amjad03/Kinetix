import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCodeFilter } from './common/error-codes.js';

/** Settings shared by the server and the e2e tests. */
export function configureApp(app: NestExpressApplication): void {
  app.enableCors();
  app.enableShutdownHooks();
  // Saved whiteboards are JSON stroke data; a busy multi-page lesson is a few MB.
  app.useBodyParser('json', { limit: '8mb' });
  // Every error carries a stable `code` the apps can translate.
  app.useGlobalFilters(new ErrorCodeFilter(app.get(HttpAdapterHost).httpAdapter));
}
