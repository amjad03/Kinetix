import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ENV, type Env } from '../config/env.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Database access.
 *
 * - `withTenant` is the only way request handlers touch tenant data. It runs on the
 *   `kinetix_app` role inside a transaction whose `app.tenant_id` is set, so row-level
 *   security confines every statement to that tenant.
 * - `system` uses the owner role and bypasses RLS. Only {@link SystemLookups} may use it,
 *   for the few lookups that happen before a tenant is known, and the platform team's endpoints
 *   (src/platform/, behind PlatformAdminGuard), which write the global library.
 */
@Injectable()
export class DbService implements OnApplicationShutdown {
  private readonly appPool: pg.Pool;
  private readonly systemPool: pg.Pool;
  private readonly app: Database;
  readonly system: Database;

  constructor(@Inject(ENV) env: Env) {
    this.appPool = new pg.Pool({ connectionString: env.APP_DATABASE_URL, max: 20 });
    this.systemPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3 });
    this.app = drizzle(this.appPool, { schema });
    this.system = drizzle(this.systemPool, { schema });
  }

  async withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return fn(tx);
    });
  }

  /** Readiness: the journal time of the newest applied migration (throws when the database is unreachable). */
  async migrationState(): Promise<number | undefined> {
    const { rows } = await this.systemPool.query<{ latest: string | null }>('select max(created_at)::text as latest from drizzle.__drizzle_migrations');
    return rows[0]?.latest ? Number(rows[0].latest) : undefined;
  }

  /** Closed last, after sockets have disconnected and running jobs have finished (beforeApplicationShutdown). */
  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.appPool.end(), this.systemPool.end()]);
  }
}
