import { HttpException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { MemoryRateLimiter, RateLimiter, type RedisEval, RedisRateLimiter } from './rate-limiter.js';

/** Plays the limiter's Lua script (INCR, PEXPIRE on first hit, PTTL) against a map. */
class FakeRedis implements RedisEval {
  now = 0;
  readonly keys = new Map<string, { n: number; expiresAt: number }>();
  async eval(_script: string, _numKeys: number, key: string | number, windowMs: string | number): Promise<unknown> {
    const k = String(key);
    let e = this.keys.get(k);
    if (!e || e.expiresAt <= this.now) e = { n: 0, expiresAt: this.now + Number(windowMs) };
    e.n++;
    this.keys.set(k, e);
    return [e.n, e.expiresAt - this.now];
  }
}

async function status(p: Promise<void>): Promise<number | 'ok'> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as HttpException).getStatus();
  }
}

/** The behaviour every limiter must have; `advance` moves its clock. */
function behaves(name: string, make: () => { limiter: RateLimiter; advance: (ms: number) => Promise<void> }) {
  describe(name, () => {
    it('allows `limit` hits per window, then 429 with retryAfterSeconds, then allows again', async () => {
      const { limiter, advance } = make();
      const key = `k-${Math.random()}`;
      for (let i = 0; i < 3; i++) expect(await status(limiter.hit(key, 3, 1000))).toBe('ok');
      const err = await limiter.hit(key, 3, 1000).catch((e: HttpException) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).getResponse()).toMatchObject({ retryAfterSeconds: 1 });
      expect(await status(limiter.hit(`${key}-other`, 3, 1000))).toBe('ok');
      await advance(1100);
      expect(await status(limiter.hit(key, 3, 1000))).toBe('ok');
    });

    it('a limit of 1 is a minimum gap', async () => {
      const { limiter, advance } = make();
      const key = `gap-${Math.random()}`;
      expect(await status(limiter.hit(key, 1, 500))).toBe('ok');
      expect(await status(limiter.hit(key, 1, 500))).toBe(429);
      await advance(600);
      expect(await status(limiter.hit(key, 1, 500))).toBe('ok');
    });
  });
}

behaves('MemoryRateLimiter', () => {
  let now = 1_000_000;
  return { limiter: new MemoryRateLimiter(() => now), advance: async (ms) => void (now += ms) };
});

behaves('RedisRateLimiter (fake Redis)', () => {
  const fake = new FakeRedis();
  return { limiter: new RedisRateLimiter(fake), advance: async (ms) => void (fake.now += ms) };
});

it('RedisRateLimiter prefixes its keys', async () => {
  const fake = new FakeRedis();
  await new RedisRateLimiter(fake).hit('otp:x', 1, 1000);
  expect([...fake.keys.keys()]).toEqual(['kx:rl:otp:x']);
});

it('RedisRateLimiter falls back to memory while Redis is unreachable', async () => {
  const limiter = new RedisRateLimiter({ eval: () => Promise.reject(new Error('Connection is closed.')) });
  expect(await status(limiter.hit('k', 1, 1000))).toBe('ok');
  expect(await status(limiter.hit('k', 1, 1000))).toBe(429);
});

// Against a real Redis when one is running (REDIS_TEST_URL, or localhost:6379); skipped otherwise.
const redisUrl = process.env.REDIS_TEST_URL ?? 'redis://localhost:6379';
const probe = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 500 });
probe.on('error', () => undefined);
const redisUp = await probe.connect().then(
  () => true,
  () => false,
);
afterAll(() => probe.disconnect());

describe.skipIf(!redisUp)('RedisRateLimiter (real Redis)', () => {
  behaves('shared across instances', () => {
    const prefix = `kx:test:${Math.random()}:`;
    return { limiter: new RedisRateLimiter(probe, prefix), advance: (ms) => new Promise((r) => setTimeout(r, ms)) };
  });

  it('two instances share one budget', async () => {
    const prefix = `kx:test:${Math.random()}:`;
    const a = new RedisRateLimiter(probe, prefix);
    const b = new RedisRateLimiter(probe, prefix);
    await a.hit('k', 2, 5000);
    await b.hit('k', 2, 5000);
    expect(await status(a.hit('k', 2, 5000))).toBe(429);
  });
});
