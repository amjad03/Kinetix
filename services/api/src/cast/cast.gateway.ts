import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { RealtimeEvents, type CastApprovedEvent, type CastEndedEvent, type CastEndReason, type CastIceEvent, type CastPendingEvent, type CastRequestAck } from '@kinetix/shared';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { errorCode } from '../common/error-codes.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { CastService } from './cast.service.js';

const uuid = z.uuid();
/** Largest signalling message relayed (an SDP offer with every codec is about 10 KB). */
const MAX_SIGNAL_CHARS = 24_000;
const Signal = z.object({
  castId: uuid,
  data: z.union([
    z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(MAX_SIGNAL_CHARS) }),
    z.object({ type: z.literal('candidate'), candidate: z.string().max(2000), sdpMid: z.string().nullish(), sdpMLineIndex: z.number().int().nullish() }),
  ]),
});

/**
 * Screen sharing to the board, on the `/realtime` namespace. A teacher's or student's phone or
 * laptop asks to cast to a board with a class open; the class teacher approves on the board
 * (the teacher casting their own screen needs no approval); then the two exchange WebRTC offer,
 * answer and ICE candidates through this gateway, which relays them unread. Video never touches
 * the server. At most four casts per board; the teacher (board or Teacher App) can stop any.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class CastGateway implements OnGatewayDisconnect {
  private readonly log = new Logger(CastGateway.name);

  constructor(
    private readonly cast: CastService,
    private readonly realtime: RealtimeGateway,
  ) {
    // The class on a board ended (teacher signed out, timetable period over, takeover).
    realtime.onClassEnded((tenantId, deviceId) => void this.endAll(tenantId, deviceId, 'class_ended'));
  }

  @SubscribeMessage(RealtimeEvents.CastRequest)
  async request(@ConnectedSocket() socket: Socket, @MessageBody() body: { deviceId?: string }): Promise<CastRequestAck> {
    const p = socket.data.principal as Principal | undefined;
    const refuse = (error: string): CastRequestAck => ({ ok: false, error, code: errorCode(403, error) });
    if (p?.kind !== 'user') return refuse('Sign in to cast');
    if (!uuid.safeParse(body?.deviceId).success) return refuse('Unknown board');
    const deviceId = body.deviceId as string;
    const started = await this.cast.start(p, deviceId);
    if ('error' in started) return refuse(started.error);

    for (const id of started.endedBefore) this.tellEnded(deviceId, p.userId, { castId: id, reason: 'stopped' });
    ((socket.data.casts ??= new Set<string>()) as Set<string>).add(started.castId);
    const iceServers = this.cast.iceServers(p.userId);
    if (started.approved) {
      this.realtime.toDevices([deviceId], RealtimeEvents.CastIce, { castId: started.castId, name: started.name, role: started.role, iceServers } satisfies CastIceEvent);
    } else {
      this.realtime.toDevices([deviceId], RealtimeEvents.CastPending, { castId: started.castId, name: started.name, role: started.role } satisfies CastPendingEvent);
    }
    return { ok: true, castId: started.castId, approved: started.approved, iceServers: started.approved ? iceServers : undefined };
  }

  /** From the board: the teacher approved or declined. */
  @SubscribeMessage(RealtimeEvents.CastDecide)
  async decide(@ConnectedSocket() socket: Socket, @MessageBody() body: { castId?: string; approve?: boolean }): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    if (!p || p.kind === 'user' || !uuid.safeParse(body?.castId).success || typeof body.approve !== 'boolean') return { ok: false };
    const sender = await this.cast.decide(p.tenantId, p.deviceId, body.castId as string, body.approve);
    if (!sender) return { ok: false };
    const castId = body.castId as string;
    if (body.approve) {
      const iceServers = this.cast.iceServers(sender.userId);
      this.realtime.toUsers([sender.userId], RealtimeEvents.CastApproved, { castId, iceServers } satisfies CastApprovedEvent);
      this.realtime.toDevices([p.deviceId], RealtimeEvents.CastIce, { castId, name: sender.name, role: sender.role as 'teacher' | 'student', iceServers } satisfies CastIceEvent);
    } else {
      this.realtime.toUsers([sender.userId], RealtimeEvents.CastEnded, { castId, reason: 'declined' } satisfies CastEndedEvent);
    }
    return { ok: true };
  }

  /** Offer, answer or ICE candidate: sender to board, or board to sender. */
  @SubscribeMessage(RealtimeEvents.CastSignal)
  async signal(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    const parsed = Signal.safeParse(body);
    if (!p || !parsed.success) return { ok: false };
    const c = await this.cast.get(p.tenantId, parsed.data.castId);
    if (!c || c.state !== 'active') return { ok: false };
    if (p.kind === 'user') {
      if (c.userId !== p.userId) return { ok: false };
      this.realtime.toDevices([c.deviceId], RealtimeEvents.CastSignal, parsed.data);
    } else {
      if (c.deviceId !== p.deviceId) return { ok: false };
      this.realtime.toUsers([c.userId], RealtimeEvents.CastSignal, parsed.data);
    }
    return { ok: true };
  }

  /** The sender, the board, or the class teacher (from the Teacher App) stops a cast. */
  @SubscribeMessage(RealtimeEvents.CastStop)
  async stop(@ConnectedSocket() socket: Socket, @MessageBody() body: { castId?: string }): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    if (!p || !uuid.safeParse(body?.castId).success) return { ok: false };
    const c = await this.cast.get(p.tenantId, body.castId as string);
    if (!c) return { ok: true };
    const allowed = p.kind === 'user' ? c.userId === p.userId || c.teacherId === p.userId : c.deviceId === p.deviceId;
    if (!allowed) return { ok: false };
    await this.cast.end(p.tenantId, c.id, 'stopped', p.kind === 'user' ? { type: 'user', id: p.userId } : { type: 'device', id: p.deviceId });
    this.tellEnded(c.deviceId, c.userId, { castId: c.id, reason: 'stopped' });
    return { ok: true };
  }

  /** A sender left (closed the tab, lost network): their casts end. A board that left ends all of its casts. */
  async handleDisconnect(socket: Socket): Promise<void> {
    const p = socket.data.principal as Principal | undefined;
    if (!p) return;
    try {
      if (p.kind === 'user') {
        const ids = [...((socket.data.casts as Set<string> | undefined) ?? [])];
        for (const c of await this.cast.endForSender(p.tenantId, p.userId, ids, 'sender_left')) this.tellEnded(c.deviceId, c.userId, { castId: c.id, reason: 'sender_left' });
      } else if (!(await this.realtime.boardStatus([p.deviceId])).get(p.deviceId)?.online) {
        await this.endAll(p.tenantId, p.deviceId, 'board_left');
      }
    } catch (e) {
      this.log.warn(`Cast cleanup failed: ${(e as Error).message}`);
    }
  }

  private async endAll(tenantId: string, deviceId: string, reason: CastEndReason): Promise<void> {
    try {
      for (const c of await this.cast.endForDevice(tenantId, deviceId, reason)) this.tellEnded(c.deviceId, c.userId, { castId: c.id, reason });
    } catch (e) {
      this.log.warn(`Ending casts failed: ${(e as Error).message}`);
    }
  }

  private tellEnded(deviceId: string, userId: string, e: CastEndedEvent): void {
    this.realtime.toDevices([deviceId], RealtimeEvents.CastEnded, e);
    this.realtime.toUsers([userId], RealtimeEvents.CastEnded, e);
  }
}
