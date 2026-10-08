import { BadRequestException, BeforeApplicationShutdown, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { auditUser } from '../common/audit.js';
import { SecretBox } from '../common/secret-box.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { connectorDeliveries, connectors } from '../db/schema.js';
import { type DomainEvent, EventBus } from '../events/events.js';
import { configSchema, connectorType, type ConnectorType } from './connector-types.js';

export const SECRETS_KEY_MISSING = 'Connector settings cannot be stored on this server yet (SECRETS_ENCRYPTION_KEY is not set)';
const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 8000;
const aad = (tenantId: string, id: string) => `${tenantId}:connector.${id}`;

/** `t=<unix seconds>,v1=<hex>`: HMAC-SHA256 of "<t>.<body>" with the connector's signing secret. */
export function signWebhook(secret: string, body: string, t: number): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

/** What a receiver does with the `X-Kinetix-Signature` header (also used by the tests). `toleranceS` rejects replays. */
export function verifyWebhook(secret: string, body: string, header: string, now = Math.floor(Date.now() / 1000), toleranceS = 300): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!m || Math.abs(now - Number(m[1])) > toleranceS) return false;
  const want = Buffer.from(signWebhook(secret, body, Number(m[1])).split('v1=')[1], 'hex');
  return timingSafeEqual(want, Buffer.from(m[2], 'hex'));
}

/** In production a webhook must be HTTPS and must not point at this network (loopback, private ranges, internal names). */
export function assertSafeUrl(raw: string, production = process.env.NODE_ENV === 'production'): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BadRequestException('The URL is not valid');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BadRequestException('The URL must start with https://');
  if (!production) return;
  if (u.protocol !== 'https:') throw new BadRequestException('The URL must start with https://');
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateV4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || (isIP(h) === 4 && privateV4.test(h)) || (isIP(h) === 6 && /^(::1?$|f[cd]|fe80)/.test(h)) || (!h.includes('.') && isIP(h) === 0)) {
    throw new BadRequestException('The URL must point to a public address');
  }
}

export interface ConnectorView {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  enabled: boolean;
  available: boolean;
  config: Record<string, unknown>;
  secretsSet: string[];
  lastTestAt: Date | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  createdAt: Date;
}

type Row = typeof connectors.$inferSelect;

/** The registry of connectors per institution: encrypted settings, test-connection, and outbound webhooks fed by the event bus. */
@Injectable()
export class ConnectorsService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly log = new Logger(ConnectorsService.name);
  private readonly box: SecretBox | undefined;
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  constructor(
    private readonly db: DbService,
    private readonly bus: EventBus,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.box = SecretBox.fromEnv(env);
  }

  onApplicationBootstrap(): void {
    // Every domain event becomes a pending delivery for each enabled webhook that subscribed to its type.
    this.bus.subscribe('connectors-webhook-out', '*', (e, tx) => this.enqueue(e, tx));
    if (this.env.EVENTS_POLL_MS > 0) {
      this.timer = setInterval(() => void this.deliverDue().catch((e) => this.log.error(e)), this.env.EVENTS_POLL_MS);
      this.timer.unref();
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  private requireBox(): SecretBox {
    if (!this.box) throw new ServiceUnavailableException(SECRETS_KEY_MISSING);
    return this.box;
  }

  private view(r: Row): ConnectorView {
    const t = connectorType(r.type);
    const pub = r.configPublic as { values?: Record<string, unknown>; secretsSet?: string[] };
    return { id: r.id, type: r.type, typeLabel: t?.label ?? r.type, name: r.name, enabled: r.enabled, available: t?.available ?? false, config: pub.values ?? {}, secretsSet: pub.secretsSet ?? [], lastTestAt: r.lastTestAt, lastTestStatus: r.lastTestStatus, lastTestMessage: r.lastTestMessage, createdAt: r.createdAt };
  }

  /** The values the ERP may show back (never a secret) and which secrets are set. */
  private publicPart(t: ConnectorType, config: Record<string, unknown>) {
    const secretKeys = t.fields.filter((f) => f.kind === 'secret').map((f) => f.key);
    return { values: Object.fromEntries(Object.entries(config).filter(([k]) => !secretKeys.includes(k))), secretsSet: secretKeys.filter((k) => config[k] !== undefined && config[k] !== '') };
  }

  private validate(t: ConnectorType, config: unknown): Record<string, unknown> {
    const r = configSchema(t).safeParse(config);
    if (!r.success) throw new BadRequestException(z.flattenError(r.error as z.ZodError));
    if (t.type === 'webhook_out') assertSafeUrl(r.data.url as string);
    return r.data;
  }

  async list(tx: Tx): Promise<ConnectorView[]> {
    return (await tx.select().from(connectors).orderBy(asc(connectors.name))).map((r) => this.view(r));
  }

  async create(tx: Tx, p: { tenantId: string; userId: string }, b: { type: string; name: string; config: unknown; enabled: boolean }): Promise<ConnectorView> {
    const t = connectorType(b.type) ?? (() => { throw new BadRequestException('Unknown connector type'); })();
    const box = this.requireBox();
    const config = this.validate(t, b.config);
    const id = randomUUID();
    try {
      const [row] = await tx.insert(connectors).values({ id, tenantId: p.tenantId, type: b.type, name: b.name, enabled: b.enabled, configEnc: box.encrypt(JSON.stringify(config), aad(p.tenantId, id)), configPublic: this.publicPart(t, config), createdBy: p.userId }).returning();
      await auditUser(tx, p, 'connector.created', 'connector', id, { type: b.type, name: b.name, enabled: b.enabled });
      return this.view(row);
    } catch (e) {
      if ((e as { code?: string; cause?: { code?: string } }).code === '23505' || (e as { cause?: { code?: string } }).cause?.code === '23505') throw new BadRequestException('A connector with that name already exists');
      throw e;
    }
  }

  private async row(tx: Tx, id: string): Promise<Row> {
    const [r] = await tx.select().from(connectors).where(eq(connectors.id, id));
    if (!r) throw new NotFoundException('Connector not found');
    return r;
  }

  /** Settings left out (or secrets left blank) keep their stored value. */
  async update(tx: Tx, p: { tenantId: string; userId: string }, id: string, b: { name?: string; config?: Record<string, unknown> }): Promise<ConnectorView> {
    const r = await this.row(tx, id);
    const t = connectorType(r.type)!;
    const box = this.requireBox();
    const patch: Partial<typeof connectors.$inferInsert> = { updatedAt: new Date() };
    if (b.name) patch.name = b.name;
    if (b.config) {
      const current = JSON.parse(box.decrypt(r.configEnc, aad(p.tenantId, id))) as Record<string, unknown>;
      const merged = { ...current };
      for (const [k, v] of Object.entries(b.config)) if (!(t.fields.find((f) => f.key === k)?.kind === 'secret' && (v === '' || v === null || v === undefined))) merged[k] = v;
      const config = this.validate(t, merged);
      patch.configEnc = box.encrypt(JSON.stringify(config), aad(p.tenantId, id));
      patch.configPublic = this.publicPart(t, config);
    }
    const [row] = await tx.update(connectors).set(patch).where(eq(connectors.id, id)).returning();
    await auditUser(tx, p, 'connector.updated', 'connector', id, { name: b.name, changed: b.config ? Object.keys(b.config) : [] });
    return this.view(row);
  }

  async setEnabled(tx: Tx, p: { tenantId: string; userId: string }, id: string, enabled: boolean): Promise<ConnectorView> {
    await this.row(tx, id);
    const [row] = await tx.update(connectors).set({ enabled, updatedAt: new Date() }).where(eq(connectors.id, id)).returning();
    await auditUser(tx, p, enabled ? 'connector.enabled' : 'connector.disabled', 'connector', id);
    return this.view(row);
  }

  async remove(tx: Tx, p: { tenantId: string; userId: string }, id: string): Promise<void> {
    const r = await this.row(tx, id);
    await tx.delete(connectors).where(eq(connectors.id, id));
    await auditUser(tx, p, 'connector.deleted', 'connector', id, { type: r.type, name: r.name });
  }

  deliveries(tx: Tx, id: string, limit = 50) {
    return tx.select().from(connectorDeliveries).where(eq(connectorDeliveries.connectorId, id)).orderBy(sql`${connectorDeliveries.createdAt} desc`).limit(limit);
  }

  /** Sends a signed `connector.test` event to a webhook; other types report that they are not available in this build. */
  async test(tx: Tx, p: { tenantId: string; userId: string }, id: string): Promise<{ status: 'ok' | 'failed' | 'not_available'; message: string; httpStatus?: number }> {
    const r = await this.row(tx, id);
    const t = connectorType(r.type)!;
    let result: { status: 'ok' | 'failed' | 'not_available'; message: string; httpStatus?: number };
    if (!t.available) result = { status: 'not_available', message: 'Not available in this build' };
    else {
      const config = JSON.parse(this.requireBox().decrypt(r.configEnc, aad(p.tenantId, id))) as { url: string; secret: string };
      const body = JSON.stringify({ id: randomUUID(), type: 'connector.test', tenantId: p.tenantId, occurredAt: new Date().toISOString(), data: { message: 'This is a test from KINETIX' } });
      const sent = await this.post(config.url, config.secret, body, 'connector.test', randomUUID());
      result = sent.ok ? { status: 'ok', message: `The endpoint answered ${sent.status}`, httpStatus: sent.status } : { status: 'failed', message: sent.error, httpStatus: sent.status };
    }
    await tx.update(connectors).set({ lastTestAt: new Date(), lastTestStatus: result.status, lastTestMessage: result.message }).where(eq(connectors.id, id));
    await auditUser(tx, p, 'connector.tested', 'connector', id, { status: result.status });
    return result;
  }

  // ----- outbound webhooks -------------------------------------------------------------------------------

  private async post(url: string, secret: string, body: string, eventType: string, deliveryId: string): Promise<{ ok: boolean; status?: number; error: string }> {
    try {
      assertSafeUrl(url);
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json', 'user-agent': 'KINETIX-Webhooks/1', 'x-kinetix-event': eventType, 'x-kinetix-delivery': deliveryId, 'x-kinetix-signature': signWebhook(secret, body, Math.floor(Date.now() / 1000)) },
        body,
      });
      await res.arrayBuffer().catch(() => undefined);
      return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status, error: '' } : { ok: false, status: res.status, error: `The endpoint answered ${res.status}` };
    } catch (e) {
      return { ok: false, error: (e as Error).name === 'TimeoutError' ? 'The endpoint did not answer in time' : `Could not reach the endpoint: ${(e as Error).message}`.slice(0, 300) };
    }
  }

  /** Event consumer (runs in the dispatcher's transaction): queue one delivery per subscribed, enabled webhook of the event's institution. */
  private async enqueue(e: DomainEvent, tx: Tx): Promise<void> {
    const hooks = await tx.select().from(connectors).where(and(eq(connectors.tenantId, e.tenantId), eq(connectors.type, 'webhook_out'), eq(connectors.enabled, true)));
    for (const h of hooks) {
      const events = ((h.configPublic as { values?: { events?: string[] } }).values?.events ?? []) as string[];
      if (events.length > 0 && !events.includes(e.type) && !events.some((x) => x.endsWith('*') && e.type.startsWith(x.slice(0, -1)))) continue;
      const envelope = { id: e.id, type: e.type, tenantId: e.tenantId, occurredAt: e.createdAt.toISOString(), aggregateType: e.aggregateType, aggregateId: e.aggregateId, data: e.payload };
      await tx.insert(connectorDeliveries).values({ tenantId: e.tenantId, connectorId: h.id, eventId: e.id, eventType: e.type, payload: envelope }).onConflictDoNothing();
    }
  }

  /** Sends every due delivery (pending or waiting to retry); returns how many were attempted. One run at a time per process. */
  deliverDue(): Promise<number> {
    this.running ??= this.deliverLoop().finally(() => (this.running = undefined));
    return this.running;
  }

  private async deliverLoop(): Promise<number> {
    const due = await this.db.system
      .select({ id: connectorDeliveries.id })
      .from(connectorDeliveries)
      .where(and(inArray(connectorDeliveries.status, ['pending', 'retrying']), lte(connectorDeliveries.nextAttemptAt, sql`now()`)))
      .orderBy(asc(connectorDeliveries.nextAttemptAt))
      .limit(50);
    let n = 0;
    for (const d of due) if (await this.attempt(d.id)) n++;
    return n;
  }

  private async attempt(id: string): Promise<boolean> {
    // Claim with a lease (pushing the next attempt a minute out) so another instance skips it while we send.
    const [d] = await this.db.system
      .update(connectorDeliveries)
      .set({ nextAttemptAt: sql`now() + interval '60 seconds'` })
      .where(and(eq(connectorDeliveries.id, id), inArray(connectorDeliveries.status, ['pending', 'retrying']), lte(connectorDeliveries.nextAttemptAt, sql`now()`)))
      .returning();
    if (!d) return false;
    const [c] = await this.db.system.select().from(connectors).where(eq(connectors.id, d.connectorId));
    let outcome: { ok: boolean; status?: number; error: string };
    if (!c || !c.enabled || !this.box) outcome = { ok: false, error: !c ? 'The connector was removed' : !c.enabled ? 'The connector is switched off' : SECRETS_KEY_MISSING };
    else {
      const cfg = JSON.parse(this.box.decrypt(c.configEnc, aad(c.tenantId, c.id))) as { url: string; secret: string };
      outcome = await this.post(cfg.url, cfg.secret, JSON.stringify(d.payload), d.eventType, d.id);
    }
    const attempts = d.attempts + 1;
    const dead = !outcome.ok && (attempts >= MAX_ATTEMPTS || !c);
    await this.db.system
      .update(connectorDeliveries)
      .set(
        outcome.ok
          ? { status: 'delivered', attempts, responseStatus: outcome.status ?? null, lastError: null, deliveredAt: new Date() }
          : { status: dead ? 'dead' : 'retrying', attempts, responseStatus: outcome.status ?? null, lastError: outcome.error, nextAttemptAt: sql`now() + make_interval(secs => ${Math.min(3600, 30 * 2 ** attempts)})` },
      )
      .where(eq(connectorDeliveries.id, id));
    return true;
  }

  /** Puts a failed or dead delivery back in the queue for the next run. */
  async retry(tx: Tx, p: { tenantId: string; userId: string }, deliveryId: string): Promise<void> {
    const [d] = await tx.select().from(connectorDeliveries).where(eq(connectorDeliveries.id, deliveryId));
    if (!d) throw new NotFoundException('Delivery not found');
    if (d.status === 'delivered') throw new BadRequestException('That delivery already succeeded');
    await tx.update(connectorDeliveries).set({ status: 'retrying', attempts: Math.min(d.attempts, MAX_ATTEMPTS - 1), nextAttemptAt: sql`now()` }).where(eq(connectorDeliveries.id, deliveryId));
    await auditUser(tx, p, 'connector.delivery_retried', 'connector', d.connectorId, { deliveryId });
    setTimeout(() => void this.deliverDue().catch((e) => this.log.error(e)), 50).unref();
  }
}
