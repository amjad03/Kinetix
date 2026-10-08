import 'reflect-metadata';
import { StructuredLogger } from './observability/structured-logger.js';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { configureApp } from './setup.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const env = loadEnv();
  // LOG_FORMAT=json: one JSON object per line (level, context, message, timestamp, pid) for log shipping.
  // Each line carries the request id, trace id, tenant and user of the request being served.
  const logger = env.LOG_FORMAT === 'json' ? new StructuredLogger() : undefined;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, ...(logger && { logger }) }); // rawBody: payment webhook signatures
  configureApp(app);

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('KINETIX Cloud API').setVersion('0.1').addBearerAuth().build(),
  );
  SwaggerModule.setup('docs', app, doc);

  await app.listen(env.PORT);
}

void bootstrap();
