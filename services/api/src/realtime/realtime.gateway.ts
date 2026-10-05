import { BeforeApplicationShutdown, Inject, Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { RealtimeEvents, type LiveAudioChunk, type LiveAudioState, type LiveFrameEvent, type LiveViewersEvent, type LiveWatchAck } from '@kinetix/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Namespace, Server, Socket } from 'socket.io';
import { AuthGuard } from '../auth/auth.guard.js';
import type { Principal, RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { errorCode } from '../common/error-codes.js';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices, sections, students, subjects, tenants, users } from '../db/schema.js';
import { REDIS } from '../redis/redis.module.js';
import { LiveState, type ViewerRole } from './live-state.js';

export const deviceRoom = (deviceId: string) => `device:${deviceId}`;
const liveRoom = (deviceId: string) => `live:${deviceId}`;
/** A signed-in user's sockets (all their devices). */
const userRoom = (userId: string) => `user:${userId}`;
/** Viewers of a board who may hear its class audio. */
const audioRoom = (deviceId: string) => `live-audio:${deviceId}`;

/** Who may look into a classroom (when the institution has live view turned on). */
export const LIVE_VIEW_ROLES: RoleName[] = ['principal', 'tenant_admin', 'hod'];

/** Largest live frame relayed; bigger ones (a huge paste) wait for the next snapshot. */
const MAX_FRAME_EVENTS = 5000;

/** Largest audio chunk relayed (base64): about a second of 16 kHz ADPCM; boards send 200 ms. */
const MAX_AUDIO_CHARS = 12_000;

interface Watch {
  deviceId: string;
  since: number;
  role: ViewerRole;
  /** May hear class audio: students always; leaders only when the institution allows it. */
  audio: boolean;
}

/** Between API instances (Redis): the teacher stopped the live class; each instance sends its students away. */
const END_CLASS_LIVE = 'kx:end-class-live';

/**
 * Socket.IO namespace `/realtime`.
 *
 * - Boards connect with their device (or board-session) token and join their own room for
 *   pairing, session and broadcast events.
 * - School leaders connect with their user token to watch a class live: the board streams
 *   its ink as lesson events only while someone is watching, and the server relays them.
 *   Every viewing is audited, and the board can show that it is being viewed.
 * - Class audio: the teacher turns the board's microphone on for the live class. The board
 *   sends short ADPCM chunks only while someone allowed to listen is watching; students in a
 *   live class may listen, school leaders only when the institution turns
 *   `classroomAudioToViewers` on. Turning audio on and off is audited.
 *
 * More than one API instance: with `REDIS_URL` set, socket.io uses the Redis adapter (emits to
 * rooms reach every instance) and {@link LiveState} keeps who is online, watching and listening
 * in Redis. Per-socket data (`socket.data.watches`) stays with the instance holding the socket.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, BeforeApplicationShutdown {
  private readonly log = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Disconnect handlers still running (awaited at shutdown, before the database closes). */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly auth: AuthGuard,
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly live: LiveState,
    @Inject(REDIS) private readonly redis: unknown,
  ) {}

  afterInit(server: Server): void {
    (server as unknown as Namespace).on(END_CLASS_LIVE, (tenantId: string, deviceId: string) =>
      void this.endLocalStudents(tenantId, deviceId)
        .then(() => this.tellBoard(tenantId, deviceId, false))
        .catch(() => undefined),
    );
  }

  /** Shutdown: disconnect this instance's sockets and let their handlers finish (audits, shared state). */
  async beforeApplicationShutdown(): Promise<void> {
    const nsp = this.server as unknown as Namespace | undefined;
    for (const socket of [...(nsp?.sockets?.values() ?? [])]) socket.disconnect(true);
    await Promise.allSettled([...this.pending]);
    await this.live.close();
  }

  /** For the dashboard: whether each board has a live socket, and how many are watching it. */
  async boardStatus(deviceIds: string[]): Promise<Map<string, { online: boolean; viewers: number }>> {
    const [online, viewers] = await Promise.all([this.live.isOnline(deviceIds), this.live.viewerCounts(deviceIds)]);
    return new Map(deviceIds.map((id, i) => [id, { online: online[i], viewers: viewers[i] }]));
  }

  private async viewerCount(deviceId: string): Promise<number> {
    return (await this.live.viewerCounts([deviceId]))[0];
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const principal = await this.auth.resolve(token);
      if (principal.kind === 'user' && principal.mustChangePassword) throw new Error('temporary password not changed');
      socket.data.principal = principal;
      if (principal.kind === 'user') {
        // Every user gets their own room (new messages); only leaders and students may watch classes.
        await socket.join(userRoom(principal.userId));
        socket.data.watches = new Map<string, Watch>();
        socket.emit('ready', { userId: principal.userId });
        return;
      }
      await socket.join(deviceRoom(principal.deviceId));
      // The board's first socket: audio starts off (also clears a flag left by a crashed instance).
      if ((await this.live.boardConnected(principal.deviceId, socket.id)) === 1) await this.live.setAudio(principal.deviceId, false);
      socket.emit('ready', { deviceId: principal.deviceId });
      // Reconnected while people are watching: carry on streaming.
      if ((await this.viewerCount(principal.deviceId)) > 0) await this.tellBoard(principal.tenantId, principal.deviceId, true);
    } catch (e) {
      this.log.debug(`Rejected socket: ${(e as Error).message}`);
      socket.emit('error', { message: 'unauthorized' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): Promise<void> {
    const done = this.disconnected(socket).catch((e) => this.log.warn(`Disconnect cleanup failed: ${(e as Error).message}`));
    this.pending.add(done);
    void done.finally(() => this.pending.delete(done));
    return done;
  }

  private async disconnected(socket: Socket): Promise<void> {
    const principal = socket.data.principal as Principal | undefined;
    if (!principal) return;
    if (principal.kind === 'user') {
      for (const deviceId of [...((socket.data.watches as Map<string, Watch>)?.keys() ?? [])]) {
        // Also runs during shutdown (beforeApplicationShutdown waits for it; the database closes after).
        await this.unwatch(socket, deviceId).catch((e) => this.log.warn(`Unwatch failed: ${(e as Error).message}`));
      }
      return;
    }
    const id = principal.deviceId;
    if ((await this.live.boardDisconnected(id, socket.id)) === 0) {
      await this.audioOff(id);
      this.server.to(liveRoom(id)).emit(RealtimeEvents.LiveEnded, { deviceId: id, reason: 'offline' });
    }
  }

  /** To every socket of these users (for example a new message). */
  toUsers(userIds: string[], event: string, payload: unknown): void {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    this.server?.to(ids.map(userRoom)).emit(event, payload);
  }

  toDevices(deviceIds: string[], event: string, payload: unknown): void {
    if (deviceIds.length === 0) return;
    this.server.to(deviceIds.map(deviceRoom)).emit(event, payload);
  }

  /** Tells viewers a class is over (called when a board session ends). */
  liveEnded(deviceId: string, reason: string): void {
    void this.audioOff(deviceId).catch((e) => this.log.warn(`Audio off failed: ${(e as Error).message}`));
    this.server?.to(liveRoom(deviceId)).emit(RealtimeEvents.LiveEnded, { deviceId, reason });
  }

  @SubscribeMessage(RealtimeEvents.LiveWatch)
  async watch(@ConnectedSocket() socket: Socket, @MessageBody() body: { deviceId?: string }): Promise<LiveWatchAck> {
    const p = socket.data.principal as Principal | undefined;
    if (p?.kind !== 'user' || !p.roles.some((r) => LIVE_VIEW_ROLES.includes(r) || r === 'student')) return { ok: false, error: 'Only school leaders and students can watch classes', code: errorCode(400, 'Only school leaders and students can watch classes') };
    const deviceId = body?.deviceId;
    if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return { ok: false, error: 'Unknown board', code: errorCode(400, 'Unknown board') };
    const role: ViewerRole = p.roles.some((r) => LIVE_VIEW_ROLES.includes(r)) ? 'leader' : 'student';

    const found = await this.db.withTenant(p.tenantId, async (tx) => {
      const [tenant] = await tx.select({ settings: tenants.settings }).from(tenants);
      if (role === 'leader' && !tenant?.settings.liveViewEnabled) return { error: 'Live view is turned off for your institution' };
      const audio = role === 'student' || tenant?.settings.classroomAudioToViewers === true;
      const [device] = await tx.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId));
      if (!device) return { error: 'Unknown board' };
      const [session] = await tx
        .select({
          teacher: users.fullName,
          section: sections.displayName,
          sectionId: boardSessions.sectionId,
          subject: subjects.name,
          startedAt: boardSessions.startedAt,
          liveForClass: boardSessions.liveForClass,
        })
        .from(boardSessions)
        .innerJoin(users, eq(users.id, boardSessions.teacherId))
        .leftJoin(sections, eq(sections.id, boardSessions.sectionId))
        .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
        .where(and(eq(boardSessions.deviceId, deviceId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
      if (!session) return { error: 'No class is being taught on this board right now' };
      if (role === 'student') {
        const [me] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
        if (!me || me.sectionId !== session.sectionId) return { error: 'This is not your class' };
        if (!session.liveForClass) return { error: 'Your teacher has not started a live class' };
      }
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: role === 'leader' ? 'live_view.start' : 'live_class.join',
        subjectType: 'device',
        subjectId: deviceId,
      });
      const { sectionId: _s, liveForClass: _l, ...shown } = session;
      return {
        session: { ...shown, startedAt: session.startedAt.toISOString() },
        audio,
      };
    });
    if ('error' in found) return { ok: false, error: found.error, code: errorCode(400, found.error) };
    if (!(await this.live.isOnline([deviceId]))[0]) return { ok: false, error: 'This board is offline', code: errorCode(400, 'This board is offline') };

    const watches = socket.data.watches as Map<string, Watch>;
    if (!watches.has(deviceId)) {
      watches.set(deviceId, {
        deviceId,
        since: Date.now(),
        role,
        audio: found.audio,
      });
      await socket.join(liveRoom(deviceId));
      if (found.audio) await socket.join(audioRoom(deviceId));
      await this.live.addViewer(deviceId, socket.id, { role, audio: found.audio });
    }
    await this.tellBoard(p.tenantId, deviceId, true);
    return {
      ok: true,
      session: found.session,
      audio: { allowed: found.audio, on: await this.live.isAudioOn(deviceId) },
    };
  }

  /** The teacher stopped the live class: students watching are sent away; leaders stay. */
  async endClassLive(tenantId: string, deviceId: string): Promise<void> {
    // Students connected to other instances are sent away by those instances.
    if (this.redis) (this.server as unknown as Namespace).serverSideEmit(END_CLASS_LIVE, tenantId, deviceId);
    await this.endLocalStudents(tenantId, deviceId);
    await this.tellBoard(tenantId, deviceId, false).catch(() => undefined);
  }

  private async endLocalStudents(tenantId: string, deviceId: string): Promise<void> {
    for (const [socketId, { role }] of await this.live.viewers(deviceId)) {
      if (role !== 'student') continue;
      // This gateway is a namespace, so its socket table is keyed by socket id; only this instance's sockets are in it.
      const socket = (this.server as unknown as Namespace).sockets.get(socketId);
      if (!socket) continue;
      socket.emit(RealtimeEvents.LiveEnded, { deviceId, reason: 'live_off' });
      await this.unwatch(socket, deviceId, false).catch(() => undefined);
    }
  }

  @SubscribeMessage(RealtimeEvents.LiveUnwatch)
  async unwatchMessage(@ConnectedSocket() socket: Socket, @MessageBody() body: { deviceId?: string }): Promise<{ ok: boolean }> {
    if (typeof body?.deviceId === 'string') await this.unwatch(socket, body.deviceId);
    return { ok: true };
  }

  /** From the board: relayed to whoever is watching it. */
  @SubscribeMessage(RealtimeEvents.LiveFrame)
  async frame(@ConnectedSocket() socket: Socket, @MessageBody() body: LiveFrameEvent): Promise<void> {
    const p = socket.data.principal as Principal | undefined;
    if (!p || p.kind === 'user' || (await this.viewerCount(p.deviceId)) === 0) return;
    if (!body || !Array.isArray(body.events) || body.events.length > MAX_FRAME_EVENTS) return;
    socket.to(liveRoom(p.deviceId)).emit(RealtimeEvents.LiveFrame, { ...body, deviceId: p.deviceId });
  }

  /** From the board: the teacher turned class audio on or off. Viewers are told either way. */
  @SubscribeMessage(RealtimeEvents.LiveAudioState)
  async audioState(@ConnectedSocket() socket: Socket, @MessageBody() body: LiveAudioState): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    if (!p || p.kind === 'user' || typeof body?.on !== 'boolean') return { ok: false };
    if (!(await this.live.setAudio(p.deviceId, body.on))) return { ok: true };
    this.server.to(liveRoom(p.deviceId)).emit(RealtimeEvents.LiveAudioState, {
      deviceId: p.deviceId,
      on: body.on,
    });
    await this.db
      .withTenant(p.tenantId, (tx) =>
        audit(tx, {
          tenantId: p.tenantId,
          actorType: 'device',
          actorId: p.deviceId,
          action: body.on ? 'live_audio.on' : 'live_audio.off',
          subjectType: 'device',
          subjectId: p.deviceId,
        }),
      )
      .catch((e) => this.log.warn(`Audit failed: ${(e as Error).message}`));
    return { ok: true };
  }

  /** From the board: class audio, relayed only to viewers allowed to hear it. */
  @SubscribeMessage(RealtimeEvents.LiveAudio)
  async audio(@ConnectedSocket() socket: Socket, @MessageBody() body: LiveAudioChunk): Promise<void> {
    const p = socket.data.principal as Principal | undefined;
    if (!p || p.kind === 'user') return;
    if (!body || typeof body.data !== 'string' || body.data.length > MAX_AUDIO_CHARS || !Number.isInteger(body.seq)) return;
    if (!(await this.live.isAudioOn(p.deviceId)) || (await this.listenerCount(p.deviceId)) === 0) return;
    socket.to(audioRoom(p.deviceId)).emit(RealtimeEvents.LiveAudio, {
      deviceId: p.deviceId,
      seq: body.seq,
      rate: 16000,
      codec: 'ima-adpcm',
      data: body.data,
    });
  }

  async listenerCount(deviceId: string): Promise<number> {
    return [...(await this.live.viewers(deviceId)).values()].filter((v) => v.audio).length;
  }

  /** The board's class is over or it went offline: audio is off until the teacher turns it on again. */
  private async audioOff(deviceId: string): Promise<void> {
    if (await this.live.setAudio(deviceId, false)) this.server?.to(liveRoom(deviceId)).emit(RealtimeEvents.LiveAudioState, { deviceId, on: false });
  }

  private async unwatch(socket: Socket, deviceId: string, tell = true): Promise<void> {
    const p = socket.data.principal as Principal;
    const watches = socket.data.watches as Map<string, Watch> | undefined;
    const w = watches?.get(deviceId);
    if (!w || p.kind !== 'user') return;
    watches!.delete(deviceId);
    await socket.leave(liveRoom(deviceId));
    await socket.leave(audioRoom(deviceId));
    await this.live.removeViewer(deviceId, socket.id);
    if (w.role === 'student') {
      if (tell) await this.tellBoard(p.tenantId, deviceId, false);
      return;
    }
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
    const watching = [...(await this.live.viewers(deviceId)).values()];
    const roles = watching.map((v) => v.role);
    const event: LiveViewersEvent = {
      count: roles.length,
      leaders: roles.filter((r) => r === 'leader').length,
      students: roles.filter((r) => r === 'student').length,
      indicator: tenant?.settings.liveViewIndicator ?? true,
      listeners: watching.filter((v) => v.audio).length,
    };
    this.server.to(deviceRoom(deviceId)).emit(RealtimeEvents.LiveViewers, event);
    if (wantSnapshot && event.count > 0) this.server.to(deviceRoom(deviceId)).emit(RealtimeEvents.LiveSnapshotRequest, {});
  }
}
