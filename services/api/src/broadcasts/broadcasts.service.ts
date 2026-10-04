import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { BroadcastMessage } from '@kinetix/shared';
import { RealtimeEvents } from '@kinetix/shared';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { boardSessions, broadcastReceipts, broadcasts, devices, sections, users, type BroadcastAudience } from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

export interface CreateBroadcast {
  title: string;
  body: string;
  priority: 'info' | 'important' | 'emergency';
  audience: BroadcastAudience;
  requiresAck: boolean;
  /** Minutes until the message stops being shown to boards that come online late. */
  ttlMinutes: number;
}

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly realtime: RealtimeGateway,
    private readonly clock: Clock,
  ) {}

  async create(tx: Tx, p: UserPrincipal, input: CreateBroadcast) {
    const now = this.clock.now();
    const [b] = await tx
      .insert(broadcasts)
      .values({
        tenantId: p.tenantId,
        senderId: p.userId,
        title: input.title,
        body: input.body,
        priority: input.priority,
        audience: input.audience,
        // Emergencies stay until cleared by the sender.
        requiresAck: input.requiresAck || input.priority === 'emergency',
        expiresAt: new Date(now.getTime() + input.ttlMinutes * 60_000),
      })
      .returning();

    const deviceIds = await this.resolveDevices(tx, input.audience);
    if (deviceIds.length) {
      await tx
        .insert(broadcastReceipts)
        .values(deviceIds.map((deviceId) => ({ tenantId: p.tenantId, broadcastId: b.id, deviceId })))
        .onConflictDoNothing();
    }
    await audit(tx, {
      tenantId: p.tenantId,
      actorType: 'user',
      actorId: p.userId,
      action: 'broadcast.sent',
      subjectType: 'broadcast',
      subjectId: b.id,
      data: { priority: b.priority, audience: input.audience, devices: deviceIds.length },
    });

    const message = await this.message(tx, b.id);
    return { message, deviceIds };
  }

  /** Emits to boards. Call after the transaction commits, so boards can fetch what they are told about. */
  deliver(message: BroadcastMessage, deviceIds: string[]): void {
    this.realtime.toDevices(deviceIds, RealtimeEvents.BroadcastNew, message);
  }

  /**
   * Which boards should show a broadcast.
   * - all / campuses / devices: every enrolled board in scope.
   * - sections / programs: boards that currently have a session for those classes.
   *   Students and parents of those classes also get it through their apps (notification worker).
   */
  async resolveDevices(tx: Tx, a: BroadcastAudience): Promise<string[]> {
    const ids = new Set<string>();
    const byDevice: SQL[] = [];
    if (a.all) byDevice.push(sql`true`);
    if (a.campusIds?.length) byDevice.push(inArray(devices.campusId, a.campusIds));
    if (a.deviceIds?.length) byDevice.push(inArray(devices.id, a.deviceIds));
    if (byDevice.length) {
      const rows = await tx.select({ id: devices.id }).from(devices).where(or(...byDevice));
      rows.forEach((r) => ids.add(r.id));
    }

    const bySection: SQL[] = [];
    if (a.sectionIds?.length) bySection.push(inArray(boardSessions.sectionId, a.sectionIds));
    if (a.programIds?.length) bySection.push(inArray(sections.programId, a.programIds));
    if (bySection.length) {
      const rows = await tx
        .selectDistinct({ id: boardSessions.deviceId })
        .from(boardSessions)
        .innerJoin(sections, eq(sections.id, boardSessions.sectionId))
        .where(and(isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now()), or(...bySection)));
      rows.forEach((r) => ids.add(r.id));
    }
    return [...ids];
  }

  async message(tx: Tx, id: string): Promise<BroadcastMessage> {
    const [row] = await tx
      .select({ b: broadcasts, sender: { id: users.id, fullName: users.fullName } })
      .from(broadcasts)
      .innerJoin(users, eq(users.id, broadcasts.senderId))
      .where(eq(broadcasts.id, id));
    if (!row) throw new NotFoundException('Broadcast not found');
    return toMessage(row.b, row.sender);
  }

  /**
   * Unexpired, uncleared broadcasts this board still has to show: anything not acknowledged,
   * except info banners, which hide themselves and count as done once displayed.
   */
  async pendingForDevice(tx: Tx, deviceId: string): Promise<BroadcastMessage[]> {
    const rows = await tx
      .select({ b: broadcasts, sender: { id: users.id, fullName: users.fullName } })
      .from(broadcastReceipts)
      .innerJoin(broadcasts, eq(broadcasts.id, broadcastReceipts.broadcastId))
      .innerJoin(users, eq(users.id, broadcasts.senderId))
      .where(
        and(
          eq(broadcastReceipts.deviceId, deviceId),
          isNull(broadcastReceipts.acknowledgedAt),
          or(ne(broadcasts.priority, 'info'), isNull(broadcastReceipts.displayedAt)),
          isNull(broadcasts.clearedAt),
          gt(broadcasts.expiresAt, this.clock.now()),
        ),
      )
      .orderBy(desc(broadcasts.createdAt));
    return rows.map((r) => toMessage(r.b, r.sender));
  }

  async markReceipt(tx: Tx, broadcastId: string, deviceId: string, kind: 'displayed' | 'acknowledged', userId?: string) {
    const now = this.clock.now();
    const set =
      kind === 'displayed' ? { displayedAt: now } : { displayedAt: now, acknowledgedAt: now, acknowledgedBy: userId ?? null };
    const [r] = await tx
      .update(broadcastReceipts)
      .set(set)
      .where(and(eq(broadcastReceipts.broadcastId, broadcastId), eq(broadcastReceipts.deviceId, deviceId)))
      .returning({ id: broadcastReceipts.id });
    if (!r) throw new NotFoundException('This board was not a recipient');
  }

  async deliveryReport(tx: Tx, broadcastId: string) {
    const rows = await tx
      .select({
        deviceId: devices.id,
        deviceName: devices.name,
        lastSeenAt: devices.lastSeenAt,
        displayedAt: broadcastReceipts.displayedAt,
        acknowledgedAt: broadcastReceipts.acknowledgedAt,
      })
      .from(broadcastReceipts)
      .innerJoin(devices, eq(devices.id, broadcastReceipts.deviceId))
      .where(eq(broadcastReceipts.broadcastId, broadcastId));
    return {
      total: rows.length,
      displayed: rows.filter((r) => r.displayedAt).length,
      acknowledged: rows.filter((r) => r.acknowledgedAt).length,
      devices: rows,
    };
  }

  async clear(tx: Tx, p: UserPrincipal, id: string): Promise<string[]> {
    const [b] = await tx.select().from(broadcasts).where(eq(broadcasts.id, id));
    if (!b) throw new NotFoundException('Broadcast not found');
    const isAdmin = p.roles.some((r) => r === 'tenant_admin' || r === 'principal');
    if (b.senderId !== p.userId && !isAdmin) throw new ForbiddenException();
    await tx.update(broadcasts).set({ clearedAt: this.clock.now() }).where(eq(broadcasts.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'broadcast.cleared', subjectType: 'broadcast', subjectId: id });
    const receipts = await tx.select({ deviceId: broadcastReceipts.deviceId }).from(broadcastReceipts).where(eq(broadcastReceipts.broadcastId, id));
    return receipts.map((r) => r.deviceId);
  }
}

function toMessage(b: typeof broadcasts.$inferSelect, sender: { id: string; fullName: string }): BroadcastMessage {
  return {
    id: b.id,
    title: b.title,
    body: b.body,
    priority: b.priority,
    requiresAck: b.requiresAck,
    sender,
    createdAt: b.createdAt.toISOString(),
    expiresAt: b.expiresAt.toISOString(),
  };
}
