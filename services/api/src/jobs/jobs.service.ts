import { BeforeApplicationShutdown, Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { jobs } from '../db/schema.js';

export type Job = typeof jobs.$inferSelect;
export type JobHandler = (job: Job) => Promise<void>;

const MAX_ATTEMPTS = 5;
/** A job still "running" after this long is assumed lost (its process died) and retried. */
const STALE_AFTER = '15 minutes';

/**
 * A small Postgres job queue. Enqueue inside the request's tenant transaction, so a job
 * exists only if the work that needs it committed. Runners in any number of API processes
 * claim jobs with FOR UPDATE SKIP LOCKED; failures retry with backoff.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly log = new Logger(JobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  constructor(
    private readonly db: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(tx: Tx, tenantId: string, kind: string, payload: Record<string, string>): Promise<void> {
    await tx.insert(jobs).values({ tenantId, kind, payload });
  }

  onApplicationBootstrap(): void {
    if (this.env.JOBS_POLL_MS > 0) {
      this.timer = setInterval(() => void this.drain().catch((e) => this.log.error(e)), this.env.JOBS_POLL_MS);
      this.timer.unref();
    }
  }

  /** Stops polling and lets a running job finish while the database is still open. */
  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** Runs due jobs until none are left. Returns how many ran. One drain at a time per process. */
  drain(): Promise<number> {
    this.running ??= this.drainLoop().finally(() => (this.running = undefined));
    return this.running;
  }

  private async drainLoop(): Promise<number> {
    let n = 0;
    for (let job = await this.claim(); job; job = await this.claim()) {
      n++;
      const handler = this.handlers.get(job.kind);
      try {
        if (!handler) throw new Error(`No handler for ${job.kind}`);
        await handler(job);
        await this.db.system.update(jobs).set({ state: 'done', lockedAt: null, lastError: null }).where(eq(jobs.id, job.id));
      } catch (e) {
        const failed = job.attempts >= MAX_ATTEMPTS;
        const backoffS = 30 * 2 ** (job.attempts - 1);
        this.log.warn(`Job ${job.kind} ${job.id} attempt ${job.attempts} failed: ${(e as Error).message}`);
        await this.db.system
          .update(jobs)
          .set({
            state: failed ? 'failed' : 'queued',
            lockedAt: null,
            lastError: (e as Error).message.slice(0, 1000),
            runAfter: sql`now() + make_interval(secs => ${backoffS})`,
          })
          .where(eq(jobs.id, job.id));
        if (failed) await this.handlers.get(`${job.kind}:failed`)?.(job).catch(() => undefined);
      }
    }
    return n;
  }

  private async claim(): Promise<Job | undefined> {
    const { rows } = await this.db.system.execute<Record<string, unknown>>(sql`
      update jobs set state = 'running', locked_at = now(), attempts = attempts + 1
      where id = (
        select id from jobs
        where (state = 'queued' and run_after <= now())
           or (state = 'running' and locked_at < now() - ${STALE_AFTER}::interval)
        order by run_after
        for update skip locked
        limit 1
      )
      returning *`);
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id as string,
      tenantId: r.tenant_id as string,
      kind: r.kind as string,
      payload: r.payload as Record<string, string>,
      state: r.state as Job['state'],
      attempts: r.attempts as number,
      runAfter: new Date(r.run_after as string),
      lockedAt: r.locked_at ? new Date(r.locked_at as string) : null,
      lastError: (r.last_error as string) ?? null,
      createdAt: new Date(r.created_at as string),
    };
  }
}
