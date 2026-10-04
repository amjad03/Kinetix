import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { LiveState, MemoryLiveState, RedisLiveState } from './live-state.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Global()
@Module({
  providers: [RealtimeGateway, { provide: LiveState, inject: [REDIS], useFactory: (redis: Redis | null) => (redis ? new RedisLiveState(redis) : new MemoryLiveState()) }],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
