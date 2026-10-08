import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { RealtimeEvents, type DeviceActionEvent } from '@kinetix/shared';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { FleetService } from './fleet.service.js';

const Ack = z.object({ id: z.uuid(), ok: z.boolean(), error: z.string().max(300).optional() });

/** Board side of the IT console, on the `/realtime` namespace next to the other gateways. */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class FleetGateway {
  constructor(private readonly fleet: FleetService) {}

  /** A board that was offline (or restarting) asks for the actions it missed. */
  @SubscribeMessage(RealtimeEvents.DeviceActionsPull)
  async pull(@ConnectedSocket() socket: Socket): Promise<DeviceActionEvent[]> {
    const p = socket.data.principal as Principal | undefined;
    if (!p || p.kind === 'user') return [];
    return this.fleet.pending(p.tenantId, p.deviceId);
  }

  @SubscribeMessage(RealtimeEvents.DeviceActionAck)
  async ack(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const p = socket.data.principal as Principal | undefined;
    const parsed = Ack.safeParse(body);
    if (!p || p.kind === 'user' || !parsed.success) return { ok: false };
    await this.fleet.ack(p.tenantId, p.deviceId, parsed.data.id, parsed.data.ok, parsed.data.error);
    return { ok: true };
  }
}
