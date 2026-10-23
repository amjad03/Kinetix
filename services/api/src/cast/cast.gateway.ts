import { Inject, Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { RealtimeEvents, type CastApprovedEvent, type CastControlEvent, type CastEndedEvent, type CastEndReason, type CastIceEvent, type CastPendingEvent, type CastRequestAck } from '@kinetix/shared';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { errorCode } from '../common/error-codes.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { verifyGuestToken, type CastGuest } from './cast-guest.js';
import { CastService } from './cast.service.js';

const uuid = z.uuid();
const Control = z.object({ castId: uuid, action: z.enum(['mute', 'unmute', 'promote']) });
type Sender = { userId: string | null; guestId: string | null };
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
 * the server. At most nine casts per board; the teacher (board or Teacher App) can stop any.
 * Guests (any laptop or phone, no account) join from the browser /cast page with the board's join
 * code; they always need the teacher's approval and can only reach that one board.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class CastGateway implements OnGatewayDisconnect {
  private readonly log = new Logger(CastGateway.name);

  constructor(
    private readonly cast: CastService,
    private readonly realtime: RealtimeGateway,
    @Inject(ENV) env: Env,
    clock: Clock,
  ) {
    realtime.setGuestResolver((token) => verifyGuestToken(env.JWT_SECRET, token, Math.floor(clock.now().getTime() / 1000)));
    // The class on a board ended (teacher signed out, timetable period over, takeover).
    realtime.onClassEnded((tenantId, deviceId) => void this.endAll(tenantId, deviceId, 'class_ended'));
  }

  @SubscribeMessage(RealtimeEvents.CastRequest)
  async request(@ConnectedSocket() socket: Socket, @MessageBody() body: { deviceId?: string }): Promise<CastRequestAck> {
    const p = socket.data.principal as Principal | undefined;
    const refuse = (error: string): CastRequestAck => ({ ok: false, error, code: errorCode(403, error) });
    const guest = socket.data.castGuest as CastGuest | undefined;
    if (guest) return this.requestAsGuest(socket, guest);
    if (p?.kind !== 'user') return refuse('Sign in to cast');
    if (!uuid.safeParse(body?.deviceId).success) return refuse('Unknown board');
    const deviceId = body.deviceId as string;
    const started = await this.cast.start(p, deviceId);
    if ('error' in started) return refuse(started.error);

    for (const id of started.endedBefore) this.tellEnded(deviceId, { userId: p.userId, guestId: null }, { castId: id, reason: 'stopped' });
    ((socket.data.casts ??= new Set<string>()) as Set<string>).add(started.castId);
    const iceServers = this.cast.iceServers(p.userId);
    if (started.approved) {
      this.realtime.toDevices([deviceId], RealtimeEvents.CastIce, { castId: started.castId, name: started.name, role: started.role, iceServers } satisfies CastIceEvent);
    } else {
      this.realtime.toDevices([deviceId], RealtimeEvents.CastPending, { castId: started.castId, name: started.name, role: started.role } satisfies CastPendingEvent);
    }
    return { ok: true, castId: started.castId, approved: started.approved, iceServers: started.approved ? iceServers : undefined };
  }

  private async requestAsGuest(socket: Socket, g: CastGuest): Promise<CastRequestAck> {
    const started = await this.cast.startGuest(g);
    if ('error' in started) return { ok: false, error: started.error, code: errorCode(403, started.error) };
    for (const id of started.endedBefore) this.tellEnded(g.deviceId, { userId: null, guestId: g.guestId }, { castId: id, reason: 'stopped' });
    ((socket.data.casts ??= new Set<string>()) as Set<string>).add(started.castId);
    this.realtime.toDevices([g.deviceId], RealtimeEvents.CastPending, { castId: started.castId, name: started.name, role: 'guest' } satisfies CastPendingEvent);
    return { ok: true, castId: started.castId, approved: false };
  }

  /** From the board: the teacher muted, resumed or promoted (made presenter) a screen; the sender is told. */
  @SubscribeMessage(RealtimeEvents.CastControl)
  async control(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    const parsed = Control.safeParse(body);
    if (!p || p.kind === 'user' || !parsed.success) return { ok: false };
    const c = await this.cast.get(p.tenantId, parsed.data.castId);
    if (!c || c.deviceId !== p.deviceId) return { ok: false };
    this.toSender(c, RealtimeEvents.CastControl, parsed.data satisfies CastControlEvent);
    return { ok: true };
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
      const iceServers = this.cast.iceServers(sender.userId ?? `guest-${sender.guestId}`);
      this.toSender(sender, RealtimeEvents.CastApproved, { castId, iceServers } satisfies CastApprovedEvent);
      this.realtime.toDevices([p.deviceId], RealtimeEvents.CastIce, { castId, name: sender.name, role: sender.role as CastIceEvent['role'], iceServers } satisfies CastIceEvent);
    } else {
      this.toSender(sender, RealtimeEvents.CastEnded, { castId, reason: 'declined' } satisfies CastEndedEvent);
    }
    return { ok: true };
  }

  /** Offer, answer or ICE candidate: sender to board, or board to sender. */
  @SubscribeMessage(RealtimeEvents.CastSignal)
  async signal(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    const guest = socket.data.castGuest as CastGuest | undefined;
    const parsed = Signal.safeParse(body);
    if ((!p && !guest) || !parsed.success) return { ok: false };
    const c = await this.cast.get(guest?.tenantId ?? p!.tenantId, parsed.data.castId);
    if (!c || c.state !== 'active') return { ok: false };
    if (guest) {
      if (c.guestId !== guest.guestId) return { ok: false };
      this.realtime.toDevices([c.deviceId], RealtimeEvents.CastSignal, parsed.data);
    } else if (p!.kind === 'user') {
      if (c.userId !== p!.userId) return { ok: false };
      this.realtime.toDevices([c.deviceId], RealtimeEvents.CastSignal, parsed.data);
    } else {
      if (c.deviceId !== p!.deviceId) return { ok: false };
      this.toSender(c, RealtimeEvents.CastSignal, parsed.data);
    }
    return { ok: true };
  }

  /** The sender, the board, or the class teacher (from the Teacher App) stops a cast. */
  @SubscribeMessage(RealtimeEvents.CastStop)
  async stop(@ConnectedSocket() socket: Socket, @MessageBody() body: { castId?: string }): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    const guest = socket.data.castGuest as CastGuest | undefined;
    if ((!p && !guest) || !uuid.safeParse(body?.castId).success) return { ok: false };
    const tenantId = guest?.tenantId ?? p!.tenantId;
    const c = await this.cast.get(tenantId, body.castId as string);
    if (!c) return { ok: true };
    const allowed = guest ? c.guestId === guest.guestId : p!.kind === 'user' ? c.userId === p!.userId || c.teacherId === p!.userId : c.deviceId === p!.deviceId;
    if (!allowed) return { ok: false };
    await this.cast.end(tenantId, c.id, 'stopped', guest ? { type: 'system' } : p!.kind === 'user' ? { type: 'user', id: p!.userId } : { type: 'device', id: p!.deviceId });
    this.tellEnded(c.deviceId, c, { castId: c.id, reason: 'stopped' });
    return { ok: true };
  }

  /** A sender left (closed the tab, lost network): their casts end. A board that left ends all of its casts. */
  async handleDisconnect(socket: Socket): Promise<void> {
    const p = socket.data.principal as Principal | undefined;
    const guest = socket.data.castGuest as CastGuest | undefined;
    const ids = [...((socket.data.casts as Set<string> | undefined) ?? [])];
    try {
      if (guest) {
        for (const c of await this.cast.endForGuest(guest, ids, 'sender_left')) this.tellEnded(c.deviceId, c, { castId: c.id, reason: 'sender_left' });
        return;
      }
      if (!p) return;
      if (p.kind === 'user') {
        for (const c of await this.cast.endForSender(p.tenantId, p.userId, ids, 'sender_left')) this.tellEnded(c.deviceId, c, { castId: c.id, reason: 'sender_left' });
      } else if (!(await this.realtime.boardStatus([p.deviceId])).get(p.deviceId)?.online) {
        await this.endAll(p.tenantId, p.deviceId, 'board_left');
      }
    } catch (e) {
      this.log.warn(`Cast cleanup failed: ${(e as Error).message}`);
    }
  }

  private async endAll(tenantId: string, deviceId: string, reason: CastEndReason): Promise<void> {
    try {
      for (const c of await this.cast.endForDevice(tenantId, deviceId, reason)) this.tellEnded(c.deviceId, c, { castId: c.id, reason });
    } catch (e) {
      this.log.warn(`Ending casts failed: ${(e as Error).message}`);
    }
  }

  private tellEnded(deviceId: string, sender: Sender, e: CastEndedEvent): void {
    this.realtime.toDevices([deviceId], RealtimeEvents.CastEnded, e);
    this.toSender(sender, RealtimeEvents.CastEnded, e);
  }

  /** To the person casting: a signed-in user's sockets, or the guest's. */
  private toSender(sender: Sender, event: string, payload: unknown): void {
    if (sender.userId) this.realtime.toUsers([sender.userId], event, payload);
    else if (sender.guestId) this.realtime.toGuests([sender.guestId], event, payload);
  }
}
