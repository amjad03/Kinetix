import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

/** The shared Redis connection, or null when `REDIS_URL` is not set (a single API instance). */
export const REDIS = Symbol('REDIS');

/**
 * `pubsub` clients (the socket.io adapter) queue commands while Redis is away instead of failing
 * them: the adapter does not catch its own command errors, which would crash the process.
 */
export function createRedis(url: string, name: string, pubsub = false): Redis {
  const log = new Logger(`Redis:${name}`);
  const client = new Redis(url, { connectionName: `kinetix-api-${name}`, maxRetriesPerRequest: pubsub ? null : 2, enableAutoPipelining: !pubsub });
  client.on('error', (e: Error) => log.warn(e.message));
  return client;
}

/** Quits cleanly when connected; drops the connection (and anything queued) when Redis is away. */
export async function closeRedis(client: Redis): Promise<void> {
  if (client.status === 'ready') await client.quit().catch(() => client.disconnect());
  else client.disconnect();
}

/** Closes the connection last, after sockets and jobs have finished (onApplicationShutdown runs after dispose). */
@Injectable()
class RedisCloser implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis) await closeRedis(this.redis);
  }
}

/**
 * Optional Redis for running more than one API instance: shared rate limits, live-classroom
 * state and the socket.io adapter. Without `REDIS_URL` everything stays in process memory.
 */
@Global()
@Module({
  providers: [{ provide: REDIS, inject: [ENV], useFactory: (env: Env) => (env.REDIS_URL ? createRedis(env.REDIS_URL, 'main') : null) }, RedisCloser],
  exports: [REDIS],
})
export class RedisModule {}
