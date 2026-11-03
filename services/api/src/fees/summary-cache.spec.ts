import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardCache } from '../common/ttl-cache.js';
import { cachedFeeSummary, feeSummaryChanged } from './summary-cache.js';

describe('fee summary cache', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    dashboardCache.clear();
  });

  it('reuses the summary until a fee changes, per institution', async () => {
    vi.stubEnv('DASHBOARD_CACHE_MS', '60000');
    let runs = 0;
    const compute = async () => ++runs;
    expect(await cachedFeeSummary('t1', compute)).toBe(1);
    expect(await cachedFeeSummary('t1', compute)).toBe(1);
    expect(await cachedFeeSummary('t2', compute)).toBe(2);
    feeSummaryChanged('t1');
    expect(await cachedFeeSummary('t1', compute)).toBe(3);
    expect(await cachedFeeSummary('t2', compute)).toBe(2);
  });

  it('computes every time when the cache is off', async () => {
    vi.stubEnv('DASHBOARD_CACHE_MS', '0');
    let runs = 0;
    await cachedFeeSummary('t3', async () => ++runs);
    await cachedFeeSummary('t3', async () => ++runs);
    expect(runs).toBe(2);
  });
});
