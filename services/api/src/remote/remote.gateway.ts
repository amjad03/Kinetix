import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { RealtimeEvents, type RemoteAttachAck, type RemoteBoardState, type RemoteCommand } from '@kinetix/shared';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { TEACHING_ROLES } from '../auth/auth.decorators.js';
import { audit } from '../common/audit.js';
import { errorCode } from '../common/error-codes.js';
import { DbService } from '../db/db.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { REMOTE_RECHECK_MS, RemoteService, type RemoteGrant } from './remote.service.js';

const unit = z.number().finite().min(0).max(1);

/** What a phone may send; `photo.show` only comes from the server after an upload. */
const Command = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['page.next', 'page.previous', 'page.add', 'slide.next', 'slide.previous', 'timer.stop', 'picker.pick', 'pointer.hide', 'recording.start', 'recording.stop']) }),
  z.object({ type: z.literal('timer.start'), seconds: z.number().int().min(5).max(3600) }),
  z.object({ type: z.literal('pointer'), x: unit, y: unit }),
]);

const State = z.object({
  page: z.number().int().min(0).max(10_000),
  pages: z.number().int().min(1).max(10_000),
  recording: z.boolean(),
  timerRunning: z.boolean(),
  slide: z.object({ index: z.number().int().min(0), count: z.number().int().min(0) }).nullish(),
});

interface Attached extends RemoteGrant {
  checkedAt: number;
}

/**
 * The phone remote, on the `/realtime` namespace next to {@link RealtimeGateway} (which signs
 * sockets in). A teacher's phone attaches to a board, then sends commands; each command is
 * checked on the server against the board's open class: only its teacher may drive it.
 * Commands go to that board's room only, and the board's state goes back only to that teacher.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RemoteGateway {
  private readonly log = new Logger(RemoteGateway.name);

  constructor(
    private readonly remote: RemoteService,
    private readonly realtime: RealtimeGateway,
    private readonly db: DbService,
  ) {}

  @SubscribeMessage(RealtimeEvents.RemoteAttach)
  async attach(@ConnectedSocket() socket: Socket, @MessageBody() body: { deviceId?: string }): Promise<RemoteAttachAck> {
    const p = socket.data.principal as Principal | undefined;
    const refuse = (error: string): RemoteAttachAck => ({ ok: false, error, code: errorCode(403, error) });
    if (p?.kind !== 'user' || !p.roles.some((r) => TEACHING_ROLES.includes(r))) return refuse('Only teachers can use the phone remote');
    const deviceId = body?.deviceId;
    if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return refuse('Unknown board');
    const grant = await this.remote.grant(p.tenantId, p.userId, deviceId);
    if (!grant) return refuse('Connect to this board from the Teacher App first');
    socket.data.remote = { ...grant, checkedAt: Date.now() } satisfies Attached;
    await this.db
      .withTenant(p.tenantId, (tx) => audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'remote.attach', subjectType: 'device', subjectId: deviceId, data: { sessionId: grant.sessionId } }))
      .catch((e) => this.log.warn(`Audit failed: ${(e as Error).message}`));
    // The board answers with its state (page, recording…), sent to this teacher.
    this.realtime.toDevices([deviceId], RealtimeEvents.RemoteCommand, { type: 'hello' } satisfies RemoteCommand);
    return { ok: true, board: { id: deviceId, name: grant.deviceName } };
  }

  @SubscribeMessage(RealtimeEvents.RemoteCommand)
  async command(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean; error?: string }> {
    const p = socket.data.principal as Principal | undefined;
    const attached = socket.data.remote as Attached | undefined;
    if (p?.kind !== 'user' || !attached) return { ok: false, error: 'Not connected to a board' };
    const parsed = Command.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'Unknown command' };
    // Pointer moves come many times a second: trust the grant for a few seconds. Everything
    // else, and the pointer after that, is checked against the board's open class again.
    if (parsed.data.type !== 'pointer' || Date.now() - attached.checkedAt > REMOTE_RECHECK_MS) {
      const grant = await this.remote.grant(p.tenantId, p.userId, attached.deviceId);
      if (!grant || grant.sessionId !== attached.sessionId) {
        socket.data.remote = undefined;
        return { ok: false, error: 'The class on this board has ended' };
      }
      attached.checkedAt = Date.now();
    }
    this.realtime.toDevices([attached.deviceId], RealtimeEvents.RemoteCommand, parsed.data);
    return { ok: true };
  }

  /** From the board: its state, for its teacher's phone only. */
  @SubscribeMessage(RealtimeEvents.RemoteState)
  async state(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<void> {
    const p = socket.data.principal as Principal | undefined;
    if (!p || p.kind === 'user') return;
    const parsed = State.safeParse(body);
    if (!parsed.success) return;
    const teacherId = p.kind === 'board' ? p.teacherId : await this.remote.teacherOf(p.tenantId, p.deviceId);
    if (!teacherId) return;
    this.realtime.toUsers([teacherId], RealtimeEvents.RemoteState, { ...parsed.data, deviceId: p.deviceId } satisfies RemoteBoardState);
  }
}
