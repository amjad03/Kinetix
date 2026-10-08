import { BeforeApplicationShutdown, Global, Inject, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { auditLog } from '../db/schema.js';
import { domainEvents, eventConsumptions } from '../db/schema-foundation.js';
import { eventsDispatched } from '../observability/metrics.js';
import { REDIS } from '../redis/redis.module.js';

/** The events the API announces. Add new ones here so consumers can import the names. */
export const DomainEvents = {
  StudentEnrolled: 'admissions.student_enrolled',
  ResultsPublished: 'exams.results_published',
  FeePaid: 'fees.payment_received',
  PayrollLocked: 'payroll.run_locked',
  // Classroom (Smartboard spec §72): one event per change, written with it (idempotent by design).
  ClassStarted: 'classroom.class_started',
  ClassEnded: 'classroom.class_ended',
  AttendanceCaptured: 'classroom.attendance_captured',
  BoardSaved: 'classroom.board_page_updated',
  LessonRecorded: 'classroom.lesson_recorded',
  HomeworkPublished: 'classroom.homework_published',
  SurveyClosed: 'surveys.closed',
  CourseRegistrationApproved: 'course_registration.approved',
  WorkflowsDecided: 'workflows.decided',
} as const;
export type DomainEventType = (typeof DomainEvents)[keyof typeof DomainEvents];

export type DomainEvent = typeof domainEvents.$inferSelect;
/** Runs in the dispatcher's transaction (owner role, no tenant filter), together with the "processed" mark: a consumer is applied at most once per event. */
export type EventHandler = (event: DomainEvent, tx: Tx) => Promise<void>;

export interface EmitInput {
  type: DomainEventType | (string & {});
  aggregateType: string;
  aggregateId?: string;
  payload?: Record<string, unknown>;
  actorId?: string;
}

const MAX_ATTEMPTS = 8;
const WAKE_CHANNEL = 'kinetix:events:wake';

/**
 * Transactional outbox + in-process dispatcher.
 *
 * `emit(tx, ...)` inserts the event in the caller's tenant transaction, so it exists if and only if
 * the business change committed. The dispatcher claims due events (FOR UPDATE SKIP LOCKED, so any
 * number of API instances can run it), and for each registered consumer inserts an
 * `event_consumptions` row and runs the handler in one transaction. A redelivery (a crash, a retry
 * after another consumer failed) finds the row and skips: consumers are idempotent by construction.
 * With Redis, `emit` also nudges the other instances to dispatch at once; polling is the backstop.
 */
@Injectable()
export class EventBus implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly log = new Logger(EventBus.name);
  private readonly consumers = new Map<string, { types: Set<string> | '*'; handler: EventHandler }>();
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;
  private subscriber?: Redis;

  constructor(
    private readonly db: DbService,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis | null,
  ) {}

  /** Registers an idempotent consumer. `name` identifies it in `event_consumptions`; never rename a live one. */
  subscribe(name: string, types: string[] | '*', handler: EventHandler): void {
    this.consumers.set(name, { types: types === '*' ? '*' : new Set(types), handler });
  }

  /** Writes the event in the caller's transaction. */
  async emit(tx: Tx, tenantId: string, input: EmitInput): Promise<string> {
    const [row] = await tx
      .insert(domainEvents)
      .values({ tenantId, type: input.type, aggregateType: input.aggregateType, aggregateId: input.aggregateId ?? null, payload: input.payload ?? {}, actorId: input.actorId ?? null })
      .returning({ id: domainEvents.id });
    if (this.redis) setTimeout(() => void this.redis?.publish(WAKE_CHANNEL, row.id).catch(() => undefined), 50).unref();
    return row.id;
  }

  onApplicationBootstrap(): void {
    if (this.env.EVENTS_POLL_MS > 0) {
      this.timer = setInterval(() => void this.drain().catch((e) => this.log.error(e)), this.env.EVENTS_POLL_MS);
      this.timer.unref();
    }
    if (this.redis && this.env.EVENTS_POLL_MS > 0) {
      this.subscriber = this.redis.duplicate();
      this.subscriber.on('error', () => undefined);
      void this.subscriber.subscribe(WAKE_CHANNEL).catch(() => undefined);
      this.subscriber.on('message', () => void this.drain().catch((e) => this.log.error(e)));
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    this.subscriber?.disconnect();
    await this.running?.catch(() => undefined);
  }

  /** Dispatches every due event; returns how many were handled. One drain at a time per process. */
  drain(): Promise<number> {
    this.running ??= this.drainLoop().finally(() => (this.running = undefined));
    return this.running;
  }

  private async drainLoop(): Promise<number> {
    let n = 0;
    while (await this.dispatchOne()) n++;
    return n;
  }

  private async dispatchOne(): Promise<boolean> {
    return this.db.system.transaction(async (tx) => {
      const [ev] = await tx
        .select()
        .from(domainEvents)
        .where(and(isNull(domainEvents.dispatchedAt), lte(domainEvents.nextAttemptAt, sql`now()`)))
        .orderBy(asc(domainEvents.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!ev) return false;
      try {
        for (const [name, c] of this.consumers) {
          if (c.types !== '*' && !c.types.has(ev.type)) continue;
          // A savepoint per consumer: a failing handler rolls back its own writes and mark only.
          await tx.transaction(async (sp) => {
            const claimed = await sp.insert(eventConsumptions).values({ consumer: name, eventId: ev.id }).onConflictDoNothing().returning({ id: eventConsumptions.eventId });
            if (claimed.length === 0) return; // already applied
            await c.handler(ev, sp as unknown as Tx);
          });
        }
        await tx.update(domainEvents).set({ dispatchedAt: new Date(), attempts: ev.attempts + 1, lastError: null }).where(eq(domainEvents.id, ev.id));
        eventsDispatched.inc({ type: ev.type, outcome: 'ok' });
      } catch (e) {
        const attempts = ev.attempts + 1;
        const dead = attempts >= MAX_ATTEMPTS;
        this.log.warn(`Event ${ev.type} ${ev.id} attempt ${attempts} failed: ${(e as Error).message}`);
        await tx
          .update(domainEvents)
          .set({ attempts, lastError: (e as Error).message.slice(0, 1000), nextAttemptAt: sql`now() + make_interval(secs => ${Math.min(3600, 5 * 2 ** attempts)})`, ...(dead ? { dispatchedAt: new Date() } : {}) })
          .where(eq(domainEvents.id, ev.id));
        eventsDispatched.inc({ type: ev.type, outcome: dead ? 'dead' : 'retry' });
      }
      return true;
    });
  }
}

/** Built-in consumer: a durable, queryable trail of every domain event in the audit log. */
@Injectable()
export class EventAuditConsumer implements OnApplicationBootstrap {
  constructor(private readonly bus: EventBus) {}

  onApplicationBootstrap(): void {
    this.bus.subscribe('audit-trail', '*', async (e, tx) => {
      await tx.insert(auditLog).values({ tenantId: e.tenantId, actorType: 'system', action: `event.${e.type}`, subjectType: e.aggregateType, subjectId: e.aggregateId ?? undefined, data: { eventId: e.id } });
    });
  }
}

@Global()
@Module({ providers: [EventBus, EventAuditConsumer], exports: [EventBus] })
export class EventsModule {}
