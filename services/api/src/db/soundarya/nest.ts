/**
 * The API's own services, started without an HTTP server, for the parts of the seed where the module
 * derives data (exam results, payroll, attainment). They run through `withTenant`, so row-level security applies.
 */
import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Tx } from '../db.service.js';

let app: INestApplicationContext | undefined;

export async function nest(): Promise<INestApplicationContext> {
  if (app) return app;
  for (const k of ['JOBS_POLL_MS', 'EVENTS_POLL_MS', 'REPORTS_POLL_MS', 'SCAN_POLL_MS']) process.env[k] ??= '0';
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module.js');
  app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  return app;
}

export async function service<T>(type: abstract new (...args: never[]) => T): Promise<T> {
  return (await nest()).get(type as unknown as Type<T>, { strict: false });
}

export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { DbService } = await import('../db.service.js');
  return (await nest()).get(DbService).withTenant(tenantId, fn);
}

export async function closeNest(): Promise<void> {
  await app?.close();
  app = undefined;
}
