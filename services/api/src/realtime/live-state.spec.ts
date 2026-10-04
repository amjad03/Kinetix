import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { type LiveState, MemoryLiveState, RedisLiveState } from './live-state.js';

const redisUrl = process.env.REDIS_TEST_URL ?? 'redis://localhost:6379';
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 500 });
redis.on('error', () => undefined);
const redisUp = await redis.connect().then(
  () => true,
  () => false,
);
afterAll(() => redis.disconnect());

function behaves(name: string, make: () => [LiveState, LiveState]) {
  describe(name, () => {
    it('counts board sockets, viewers and audio across instances', async () => {
      const [a, b] = make();
      const dev = `dev-${Math.random()}`;
      expect(await a.boardConnected(dev, 's1')).toBe(1);
      expect(await b.isOnline([dev, 'other'])).toEqual([true, false]);
      await a.addViewer(dev, 'v1', { role: 'leader', audio: false });
      await b.addViewer(dev, 'v2', { role: 'student', audio: true });
      expect(await a.viewerCounts([dev])).toEqual([2]);
      expect([...(await b.viewers(dev)).entries()].sort()).toEqual([
        ['v1', { role: 'leader', audio: false }],
        ['v2', { role: 'student', audio: true }],
      ]);
      expect(await a.setAudio(dev, true)).toBe(true);
      expect(await b.setAudio(dev, true)).toBe(false);
      expect(await b.isAudioOn(dev)).toBe(true);
      await b.removeViewer(dev, 'v2');
      expect(await a.viewerCounts([dev])).toEqual([1]);
      expect(await b.boardDisconnected(dev, 's1')).toBe(0);
      expect(await a.isOnline([dev])).toEqual([false]);
      await a.close();
      await b.close();
    });
  });
}

behaves('MemoryLiveState (one instance)', () => {
  const m = new MemoryLiveState();
  return [m, m];
});

describe.skipIf(!redisUp)('RedisLiveState (real Redis)', () => {
  behaves('two instances', () => {
    const prefix = `kx:test:${Math.random()}:`;
    return [new RedisLiveState(redis, prefix), new RedisLiveState(redis, prefix)];
  });

  it("ignores and cleans up the sockets of an instance that stopped (crash or shutdown)", async () => {
    const prefix = `kx:test:${Math.random()}:`;
    const a = new RedisLiveState(redis, prefix);
    const b = new RedisLiveState(redis, prefix);
    await a.boardConnected('d', 's1');
    await a.addViewer('d', 'v1', { role: 'leader', audio: false });
    await b.addViewer('d', 'v2', { role: 'leader', audio: false });
    expect(await b.viewerCounts(['d'])).toEqual([2]);
    await a.close(); // its heartbeat key is gone, as after a crash once it expires
    expect(await b.isOnline(['d'])).toEqual([false]);
    expect(await b.viewerCounts(['d'])).toEqual([1]);
    expect(await redis.hlen(`${prefix}viewers:d`)).toBe(1);
    await b.close();
  });
});
