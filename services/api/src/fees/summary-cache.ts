import { dashboardCache, dashboardTtl, scopeKey } from '../common/ttl-cache.js';

/**
 * `GET /v1/fees/summary` aggregates every invoice of the institution; dashboards ask for it on every load. The answer is
 * reused for the dashboard cache's time (DASHBOARD_CACHE_MS, 30 s by default), and a payment, an issue or a cancellation in
 * this API instance starts a fresh one at once (the institution's epoch moves on), so the counter's own totals never lag.
 */
const epochs = new Map<string, number>();

/** Fee figures of this institution changed: the next summary is computed afresh. */
export function feeSummaryChanged(tenantId: string): void {
  epochs.set(tenantId, (epochs.get(tenantId) ?? 0) + 1);
  if (epochs.size > 5000) epochs.delete(epochs.keys().next().value!);
}

export function cachedFeeSummary<T>(tenantId: string, compute: () => Promise<T>): Promise<T> {
  return dashboardCache.get(scopeKey('fees.summary', tenantId, { epoch: epochs.get(tenantId) ?? 0 }), dashboardTtl(), compute);
}
