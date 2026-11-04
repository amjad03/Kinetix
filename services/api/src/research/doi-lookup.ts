import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { researchDoiCache } from '../db/schema-research.js';
import { DOI_CACHE_DAYS, DoiResolver, type DoiRecord, type DoiSource } from './doi.js';

/**
 * DOI look-up with an offline fallback: a recent cached copy answers at once; otherwise the registry is asked (outside
 * any transaction) and its answer kept; when the registry cannot be reached an older cached copy still answers, and
 * with none the caller is told the registry is offline, so the details can be typed in and filled in later.
 */
@Injectable()
export class DoiLookup {
  constructor(
    private readonly db: DbService,
    private readonly resolver: DoiResolver,
    private readonly clock: Clock,
  ) {}

  private cached(tenantId: string, doi: string) {
    return this.db.withTenant(tenantId, async (tx) => (await tx.select().from(researchDoiCache).where(sql`lower(${researchDoiCache.doi}) = ${doi.toLowerCase()}`).limit(1))[0] ?? null);
  }

  async lookup(tenantId: string, doi: string): Promise<{ source: DoiSource; record: DoiRecord | null }> {
    const hit = await this.cached(tenantId, doi);
    const fresh = hit && this.clock.now().getTime() - new Date(hit.fetchedAt).getTime() < DOI_CACHE_DAYS * 86_400_000;
    if (hit && fresh) return { source: 'cache', record: hit.record as DoiRecord };
    let record: DoiRecord | null;
    try {
      record = await this.resolver.resolve(doi);
    } catch {
      return hit ? { source: 'cache', record: hit.record as DoiRecord } : { source: 'offline', record: null };
    }
    if (!record) return { source: 'not_found', record: null };
    const now = this.clock.now();
    await this.db.withTenant(tenantId, async (tx) => {
      if (hit) await tx.update(researchDoiCache).set({ record, fetchedAt: now }).where(eq(researchDoiCache.id, hit.id));
      else await tx.insert(researchDoiCache).values({ tenantId, doi, record, fetchedAt: now }).onConflictDoNothing();
    });
    return { source: 'registry', record };
  }
}
