import { currentContext } from '../observability/request-context.js';

/**
 * A short-lived cache for institution-wide dashboard aggregates (counts and percentages that every principal of the institution
 * sees the same way). Concurrent requests for the same key share one computation, and an answer is reused for `ttlMs`.
 * Use it only for figures with no per-person rows, after the route's role check; the key always includes the institution and
 * the caller's campus scope (row-level security limits campus-scoped staff, so their figures differ).
 * In memory per API instance: a figure can be up to `ttlMs` old on each instance.
 */
export class TtlCache {
  private readonly entries = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    private readonly max = 2000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
    const t = this.now();
    const hit = this.entries.get(key);
    if (hit && t - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = compute();
    this.entries.set(key, { at: t, value });
    // A failure is not kept.
    value.catch(() => this.entries.get(key)?.value === value && this.entries.delete(key));
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const dashboardCache = new TtlCache();

/** How long dashboard figures are reused: DASHBOARD_CACHE_MS (default 30 s; the tests set 0). */
export const dashboardTtl = (): number => Number(process.env.DASHBOARD_CACHE_MS ?? 30_000);

/** The cache key for a dashboard figure: what, for which institution and campus scope, with which parameters. */
export function scopeKey(name: string, tenantId: string, params: unknown = {}): string {
  return `${name}|${tenantId}|${(currentContext()?.campusIds ?? []).join(',')}|${JSON.stringify(params)}`;
}
