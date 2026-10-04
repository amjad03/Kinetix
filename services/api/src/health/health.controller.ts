import { Controller, Get, Inject, Module, Res } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { DbService } from '../db/db.service.js';
import { REDIS } from '../redis/redis.module.js';

type Check = 'ok' | 'failed' | 'pending' | 'not_configured';

/** The newest migration this build ships (drizzle records each applied one by its journal time). */
function latestMigration(): { tag: string; when: number } | undefined {
  const journal = JSON.parse(readFileSync(new URL('../../migrations/meta/_journal.json', import.meta.url), 'utf8')) as { entries: { tag: string; when: number }[] };
  return journal.entries.at(-1);
}

const within = <T>(ms: number, p: Promise<T>) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref())]);

/**
 * Probes for the load balancer and orchestrator (no auth).
 * - `GET /health`: liveness, the process is up and serving.
 * - `GET /ready`: may receive traffic: the database answers, every migration this build ships
 *   is applied, and Redis answers when `REDIS_URL` is set. 503 with the failing checks otherwise.
 */
@Controller()
export class HealthController {
  private readonly expected = latestMigration();

  constructor(
    private readonly db: DbService,
    @Inject(REDIS) private readonly redis: Redis | null,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks: Record<'database' | 'migrations' | 'redis', Check> = { database: 'failed', migrations: 'failed', redis: 'not_configured' };
    await Promise.all([
      within(2000, this.db.migrationState())
        .then((latestApplied) => {
          checks.database = 'ok';
          checks.migrations = this.expected && (latestApplied ?? 0) >= this.expected.when ? 'ok' : 'pending';
        })
        .catch(() => undefined),
      this.redis
        ? within(2000, this.redis.ping())
            .then(() => void (checks.redis = 'ok'))
            .catch(() => void (checks.redis = 'failed'))
        : undefined,
    ]);
    const ready = Object.values(checks).every((c) => c === 'ok' || c === 'not_configured');
    if (!ready) res.status(503);
    return { status: ready ? 'ready' : 'not_ready', checks };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
