import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { configureApp } from './setup.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const env = loadEnv();
  // LOG_FORMAT=json: one JSON object per line (level, context, message, timestamp, pid) for log shipping.
  const logger = env.LOG_FORMAT === 'json' ? new ConsoleLogger({ json: true, colors: false }) : undefined;
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
