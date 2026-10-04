import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthGuard } from '../auth/auth.guard.js';

export const deviceRoom = (deviceId: string) => `device:${deviceId}`;

/**
 * Socket.IO namespace `/realtime`. Boards connect with their device token (or board-session
 * token) in `auth.token` and join their own room. Server → board events only for now.
 *
 * TODO: add the Redis adapter before running more than one API instance.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Open sockets per device, for the dashboard's "online" indicator. */
  private readonly connected = new Map<string, number>();

  constructor(private readonly auth: AuthGuard) {}

  isOnline(deviceId: string): boolean {
    return (this.connected.get(deviceId) ?? 0) > 0;
  }

  handleDisconnect(socket: Socket): void {
    const id = socket.data.principal?.deviceId as string | undefined;
    if (!id) return;
    const n = (this.connected.get(id) ?? 1) - 1;
    if (n <= 0) this.connected.delete(id);
    else this.connected.set(id, n);
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const principal = await this.auth.resolve(token);
      if (principal.kind === 'user') throw new Error('user sockets are not supported yet');
      socket.data.principal = principal;
      await socket.join(deviceRoom(principal.deviceId));
      this.connected.set(principal.deviceId, (this.connected.get(principal.deviceId) ?? 0) + 1);
      socket.emit('ready', { deviceId: principal.deviceId });
    } catch (e) {
      this.log.debug(`Rejected socket: ${(e as Error).message}`);
      socket.emit('error', { message: 'unauthorized' });
      socket.disconnect(true);
    }
  }

  toDevices(deviceIds: string[], event: string, payload: unknown): void {
    if (deviceIds.length === 0) return;
    this.server.to(deviceIds.map(deviceRoom)).emit(event, payload);
  }
}
