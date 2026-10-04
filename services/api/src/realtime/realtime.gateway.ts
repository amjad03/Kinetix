import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { RealtimeEvents, type LiveFrameEvent, type LiveViewersEvent, type LiveWatchAck } from '@kinetix/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { AuthGuard } from '../auth/auth.guard.js';
import type { Principal, RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices, sections, subjects, tenants, users } from '../db/schema.js';

export const deviceRoom = (deviceId: string) => `device:${deviceId}`;
const liveRoom = (deviceId: string) => `live:${deviceId}`;

/** Who may look into a classroom (when the institution has live view turned on). */
export const LIVE_VIEW_ROLES: RoleName[] = ['principal', 'tenant_admin', 'hod'];

/** Largest live frame relayed; bigger ones (a huge paste) wait for the next snapshot. */
const MAX_FRAME_EVENTS = 5000;

interface Watch {
  deviceId: string;
  since: number;
}

/**
 * Socket.IO namespace `/realtime`.
 *
 * - Boards connect with their device (or board-session) token and join their own room for
 *   pairing, session and broadcast events.
 * - School leaders connect with their user token to watch a class live: the board streams
 *   its ink as lesson events only while someone is watching, and the server relays them.
 *   Every viewing is audited, and the board can show that it is being viewed.
 *
 * TODO: add the Redis adapter before running more than one API instance (the viewer counts
 * below are per process).
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Open sockets per device, for the dashboard's "online" indicator. */
  private readonly connected = new Map<string, number>();

  /** Viewer sockets per watched device. */
  private readonly viewers = new Map<string, Set<string>>();

  constructor(
    private readonly auth: AuthGuard,
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  isOnline(deviceId: string): boolean {
    return (this.connected.get(deviceId) ?? 0) > 0;
  }

  viewerCount(deviceId: string): number {
    return this.viewers.get(deviceId)?.size ?? 0;
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const principal = await this.auth.resolve(token);
      socket.data.principal = principal;
      if (principal.kind === 'user') {
        if (!principal.roles.some((r) => LIVE_VIEW_ROLES.includes(r))) throw new Error('role cannot watch classes');
        socket.data.watches = new Map<string, Watch>();
        socket.emit('ready', { userId: principal.userId });
        return;
      }
      await socket.join(deviceRoom(principal.deviceId));
      this.connected.set(principal.deviceId, (this.connected.get(principal.deviceId) ?? 0) + 1);
      socket.emit('ready', { deviceId: principal.deviceId });
      // Reconnected while people are watching: carry on streaming.
      if (this.viewerCount(principal.deviceId) > 0) await this.tellBoard(principal.tenantId, principal.deviceId, true);
    } catch (e) {
      this.log.debug(`Rejected socket: ${(e as Error).message}`);
      socket.emit('error', { message: 'unauthorized' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const principal = socket.data.principal as Principal | undefined;
    if (!principal) return;
    if (principal.kind === 'user') {
      for (const deviceId of [...((socket.data.watches as Map<string, Watch>)?.keys() ?? [])]) {
        // Also runs during shutdown, when the database may already be closed.
        await this.unwatch(socket, deviceId).catch((e) => this.log.warn(`Unwatch failed: ${(e as Error).message}`));
      }
      return;
    }
    const id = principal.deviceId;
    const n = (this.connected.get(id) ?? 1) - 1;
    if (n <= 0) {
      this.connected.delete(id);
      this.server.to(liveRoom(id)).emit(RealtimeEvents.LiveEnded, { deviceId: id, reason: 'offline' });
    } else this.connected.set(id, n);
  }

  toDevices(deviceIds: string[], event: string, payload: unknown): void {
    if (deviceIds.length === 0) return;
    this.server.to(deviceIds.map(deviceRoom)).emit(event, payload);
  }

  /** Tells viewers a class is over (called when a board session ends). */
  liveEnded(deviceId: string, reason: string): void {
    this.server?.to(liveRoom(deviceId)).emit(RealtimeEvents.LiveEnded, { deviceId, reason });
  }

  @SubscribeMessage(RealtimeEvents.LiveWatch)
  async watch(@ConnectedSocket() socket: Socket, @MessageBody() body: { deviceId?: string }): Promise<LiveWatchAck> {
    const p = socket.data.principal as Principal | undefined;
    if (p?.kind !== 'user') return { ok: false, error: 'Only school leaders can watch classes' };
    const deviceId = body?.deviceId;
    if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return { ok: false, error: 'Unknown board' };

    const found = await this.db.withTenant(p.tenantId, async (tx) => {
      const [tenant] = await tx.select({ settings: tenants.settings }).from(tenants);
      if (!tenant?.settings.liveViewEnabled) return { error: 'Live view is turned off for your institution' };
      const [device] = await tx.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId));
      if (!device) return { error: 'Unknown board' };
      const [session] = await tx
        .select({ teacher: users.fullName, section: sections.displayName, subject: subjects.name, startedAt: boardSessions.startedAt })
        .from(boardSessions)
        .innerJoin(users, eq(users.id, boardSessions.teacherId))
        .leftJoin(sections, eq(sections.id, boardSessions.sectionId))
        .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
        .where(and(eq(boardSessions.deviceId, deviceId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
      if (!session) return { error: 'No class is being taught on this board right now' };
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'live_view.start', subjectType: 'device', subjectId: deviceId });
      return { session: { ...session, startedAt: session.startedAt.toISOString() } };
    });
    if ('error' in found) return { ok: false, error: found.error };
    if (!this.isOnline(deviceId)) return { ok: false, error: 'This board is offline' };

    const watches = socket.data.watches as Map<string, Watch>;
    if (!watches.has(deviceId)) {
      watches.set(deviceId, { deviceId, since: Date.now() });
      await socket.join(liveRoom(deviceId));
      const set = this.viewers.get(deviceId) ?? new Set<string>();
      set.add(socket.id);
      this.viewers.set(deviceId, set);
    }
    await this.tellBoard(p.tenantId, deviceId, true);
    return { ok: true, session: found.session };
  }

  @SubscribeMessage(RealtimeEvents.LiveUnwatch)
  async unwatchMessage(@ConnectedSocket() socket: Socket, @MessageBody() body: { deviceId?: string }): Promise<{ ok: boolean }> {
    if (typeof body?.deviceId === 'string') await this.unwatch(socket, body.deviceId);
    return { ok: true };
  }

  /** From the board: relayed to whoever is watching it. */
  @SubscribeMessage(RealtimeEvents.LiveFrame)
  frame(@ConnectedSocket() socket: Socket, @MessageBody() body: LiveFrameEvent): void {
    const p = socket.data.principal as Principal | undefined;
    if (!p || p.kind === 'user' || this.viewerCount(p.deviceId) === 0) return;
    if (!body || !Array.isArray(body.events) || body.events.length > MAX_FRAME_EVENTS) return;
    socket.to(liveRoom(p.deviceId)).emit(RealtimeEvents.LiveFrame, { ...body, deviceId: p.deviceId });
  }

  private async unwatch(socket: Socket, deviceId: string): Promise<void> {
    const p = socket.data.principal as Principal;
    const watches = socket.data.watches as Map<string, Watch> | undefined;
    const w = watches?.get(deviceId);
    if (!w || p.kind !== 'user') return;
    watches!.delete(deviceId);
    await socket.leave(liveRoom(deviceId));
    const set = this.viewers.get(deviceId);
    set?.delete(socket.id);
    if (set && set.size === 0) this.viewers.delete(deviceId);
    await this.db
      .withTenant(p.tenantId, (tx) =>
        audit(tx, {
          tenantId: p.tenantId,
          actorType: 'user',
          actorId: p.userId,
          action: 'live_view.end',
          subjectType: 'device',
          subjectId: deviceId,
          data: { seconds: Math.round((Date.now() - w.since) / 1000) },
        }),
      )
      .catch((e) => this.log.warn(`Audit failed: ${(e as Error).message}`));
    await this.tellBoard(p.tenantId, deviceId, false);
  }

  /** Viewer count to the board; a new viewer also needs a full snapshot. */
  private async tellBoard(tenantId: string, deviceId: string, wantSnapshot: boolean): Promise<void> {
    const [tenant] = await this.db.withTenant(tenantId, (tx) => tx.select({ settings: tenants.settings }).from(tenants));
    const event: LiveViewersEvent = { count: this.viewerCount(deviceId), indicator: tenant?.settings.liveViewIndicator ?? true };
    this.server.to(deviceRoom(deviceId)).emit(RealtimeEvents.LiveViewers, event);
    if (wantSnapshot && event.count > 0) this.server.to(deviceRoom(deviceId)).emit(RealtimeEvents.LiveSnapshotRequest, {});
  }
}
