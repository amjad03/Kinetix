import { HttpException, HttpStatus, Logger } from '@nestjs/common';

export const TOO_MANY = 'Too many attempts. Try again in a minute.';

function tooMany(retryAfterMs: number): HttpException {
  return new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: TOO_MANY, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }, HttpStatus.TOO_MANY_REQUESTS);
}

/**
 * Fixed-window rate limits. `hit` counts one attempt against `key` and throws 429
 * (code RATE_LIMITED, with `retryAfterSeconds`) once more than `limit` attempts fall in the
 * window. A limit of 1 makes a minimum gap between attempts (for example the OTP resend gap).
 *
 * In memory with one API instance; in Redis (shared by all instances) when `REDIS_URL` is set.
 */
export abstract class RateLimiter {
  abstract hit(key: string, limit: number, windowMs: number): Promise<void>;
}

export class MemoryRateLimiter extends RateLimiter {
  private readonly windows = new Map<string, { resetAt: number; count: number }>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = () => Date.now()) {
    super();
  }

  async hit(key: string, limit: number, windowMs: number): Promise<void> {
    const now = this.now();
    this.sweep(now);
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { resetAt: now + windowMs, count: 1 });
      return;
    }
    w.count++;
    if (w.count > limit) throw tooMany(w.resetAt - now);
  }

  /** Drops expired windows now and then, so keys from long ago do not pile up. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
  }
}

/** The one Redis command the limiter needs (ioredis `eval`), so tests can use a fake. */
export interface RedisEval {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/** INCR, and start the window's expiry on the first hit; returns [count, ms left]. Atomic in Redis. */
const HIT_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return {n, ttl}`;

/**
 * Shared by all instances. While Redis is unreachable it falls back to this instance's memory,
 * so sign-in keeps working (with per-instance limits) instead of failing.
 */
export class RedisRateLimiter extends RateLimiter {
  private readonly log = new Logger(RedisRateLimiter.name);
  private readonly fallback = new MemoryRateLimiter();

  constructor(
    private readonly redis: RedisEval,
    private readonly prefix = 'kx:rl:',
  ) {
    super();
  }

  async hit(key: string, limit: number, windowMs: number): Promise<void> {
    let result: [number, number];
    try {
      result = (await this.redis.eval(HIT_SCRIPT, 1, this.prefix + key, windowMs)) as [number, number];
    } catch (e) {
      this.log.warn(`Redis unavailable, limiting in memory: ${(e as Error).message}`);
      return this.fallback.hit(key, limit, windowMs);
    }
    if (Number(result[0]) > limit) throw tooMany(Number(result[1]));
  }
}
