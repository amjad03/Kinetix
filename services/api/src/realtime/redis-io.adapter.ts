import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../redis/redis.module.js';

// Typed from IoAdapter: @nestjs/platform-socket.io may resolve its own copy of socket.io.
type Server = ReturnType<IoAdapter['createIOServer']>;
type ServerOptions = Parameters<IoAdapter['createIOServer']>[1];

/**
 * socket.io over Redis pub/sub: an emit to a room reaches the sockets in that room on every
 * API instance (boards, viewers and users may be connected to different instances).
 */
export class RedisIoAdapter extends IoAdapter {
  private clients?: [Redis, Redis];

  constructor(
    app: ConstructorParameters<typeof IoAdapter>[0],
    private readonly url: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options);
    if (!this.clients) {
      // No auto-pipelining (the adapter's unsubscribe on close must reach Redis before quit), no retry limit.
      const pub = createRedis(this.url, 'io-pub', true);
      this.clients = [pub, pub.duplicate()];
    }
    server.adapter(createAdapter(this.clients[0], this.clients[1], { key: 'kx:io' }));
    return server;
  }

  /** After every socket.io server has closed (Nest calls `close` per server, then `dispose` once). */
  async dispose(): Promise<void> {
    await super.dispose();
    const clients = this.clients;
    this.clients = undefined;
    await Promise.all((clients ?? []).map(closeRedis));
  }
}
