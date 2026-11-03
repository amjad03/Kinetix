import { describe, expect, it } from 'vitest';
import { requestContext } from '../observability/request-context.js';
import { scopeKey, TtlCache } from './ttl-cache.js';

describe('dashboard cache', () => {
  it('shares one computation between concurrent callers and reuses it for the TTL', async () => {
    let now = 0;
    const c = new TtlCache(10, () => now);
    let runs = 0;
    const work = () => new Promise<number>((r) => setTimeout(() => r(++runs), 5));
    const [a, b] = await Promise.all([c.get('k', 1000, work), c.get('k', 1000, work)]);
    expect([a, b, runs]).toEqual([1, 1, 1]);
    now = 999;
    expect(await c.get('k', 1000, work)).toBe(1);
    now = 1000;
    expect(await c.get('k', 1000, work)).toBe(2);
  });

  it('does not keep failures, and a TTL of 0 always recomputes', async () => {
    const c = new TtlCache();
    await expect(c.get('x', 60_000, () => Promise.reject(new Error('db down')))).rejects.toThrow();
    expect(await c.get('x', 60_000, async () => 'ok')).toBe('ok');
    let n = 0;
    await c.get('y', 0, async () => ++n);
    await c.get('y', 0, async () => ++n);
    expect(n).toBe(2);
  });

  it('keys by institution and campus scope, so campus-limited staff never see the whole institution', () => {
    const whole = scopeKey('kpis', 't1');
    const limited = requestContext.run({ requestId: 'r', traceId: 't', spanId: 's', campusIds: ['c1'] } as never, () => scopeKey('kpis', 't1'));
    expect(whole).not.toBe(limited);
    expect(scopeKey('kpis', 't1')).not.toBe(scopeKey('kpis', 't2'));
  });

  it('stays bounded', async () => {
    const c = new TtlCache(3);
    for (let i = 0; i < 10; i++) await c.get(`k${i}`, 60_000, async () => i);
    expect((c as unknown as { entries: Map<string, unknown> }).entries.size).toBe(3);
  });
});
