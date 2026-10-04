var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var JobsService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { ENV } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { jobs } from '../db/schema.js';
const MAX_ATTEMPTS = 5;
/** A job still "running" after this long is assumed lost (its process died) and retried. */
const STALE_AFTER = '15 minutes';
/**
 * A small Postgres job queue. Enqueue inside the request's tenant transaction, so a job
 * exists only if the work that needs it committed. Runners in any number of API processes
 * claim jobs with FOR UPDATE SKIP LOCKED; failures retry with backoff.
 */
let JobsService = JobsService_1 = class JobsService {
    constructor(db, env) {
        this.db = db;
        this.env = env;
        this.log = new Logger(JobsService_1.name);
        this.handlers = new Map();
    }
    register(kind, handler) {
        this.handlers.set(kind, handler);
    }
    async enqueue(tx, tenantId, kind, payload) {
        await tx.insert(jobs).values({ tenantId, kind, payload });
    }
    onApplicationBootstrap() {
        if (this.env.JOBS_POLL_MS > 0) {
            this.timer = setInterval(() => void this.drain().catch((e) => this.log.error(e)), this.env.JOBS_POLL_MS);
            this.timer.unref();
        }
    }
    async onApplicationShutdown() {
        clearInterval(this.timer);
        await this.running?.catch(() => undefined);
    }
    /** Runs due jobs until none are left. Returns how many ran. One drain at a time per process. */
    drain() {
        this.running ??= this.drainLoop().finally(() => (this.running = undefined));
        return this.running;
    }
    async drainLoop() {
        let n = 0;
        for (let job = await this.claim(); job; job = await this.claim()) {
            n++;
            const handler = this.handlers.get(job.kind);
            try {
                if (!handler)
                    throw new Error(`No handler for ${job.kind}`);
                await handler(job);
                await this.db.system.update(jobs).set({ state: 'done', lockedAt: null, lastError: null }).where(eq(jobs.id, job.id));
            }
            catch (e) {
                const failed = job.attempts >= MAX_ATTEMPTS;
                const backoffS = 30 * 2 ** (job.attempts - 1);
                this.log.warn(`Job ${job.kind} ${job.id} attempt ${job.attempts} failed: ${e.message}`);
                await this.db.system
                    .update(jobs)
                    .set({
                    state: failed ? 'failed' : 'queued',
                    lockedAt: null,
                    lastError: e.message.slice(0, 1000),
                    runAfter: sql `now() + make_interval(secs => ${backoffS})`,
                })
                    .where(eq(jobs.id, job.id));
                if (failed)
                    await this.handlers.get(`${job.kind}:failed`)?.(job).catch(() => undefined);
            }
        }
        return n;
    }
    async claim() {
        const { rows } = await this.db.system.execute(sql `
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
        if (!r)
            return undefined;
        return {
            id: r.id,
            tenantId: r.tenant_id,
            kind: r.kind,
            payload: r.payload,
            state: r.state,
            attempts: r.attempts,
            runAfter: new Date(r.run_after),
            lockedAt: r.locked_at ? new Date(r.locked_at) : null,
            lastError: r.last_error ?? null,
            createdAt: new Date(r.created_at),
        };
    }
};
JobsService = JobsService_1 = __decorate([
    Injectable(),
    __param(1, Inject(ENV)),
    __metadata("design:paramtypes", [DbService, Object])
], JobsService);
export { JobsService };
//# sourceMappingURL=jobs.service.js.map