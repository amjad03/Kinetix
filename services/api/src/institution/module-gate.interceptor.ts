import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { from, type Observable, switchMap } from 'rxjs';
import { DbService } from '../db/db.service.js';
import { institutionProfiles, tenants, type Edition } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { BOARD_ONLY_MESSAGE, EDITION_BOARD_ONLY, erpOnlyPath, publicSlugOf } from './edition.js';
import { moduleOfPath } from './presets.js';

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; off: string[]; edition: Edition }>();

/** Forget a tenant's cached module switches and edition (after the profile, a preset or the edition changes). */
export const invalidateModuleGate = (tenantId?: string) => (tenantId ? cache.delete(tenantId) : cache.clear());

/**
 * Refuses API calls for a module the institution has switched off, so a hidden ERP section is not
 * reachable by URL or by an app, and every ERP-only module in the board edition (403
 * EDITION_BOARD_ONLY). Runs after authentication; platform routes pass, and public routes are
 * checked by the institution slug in their path.
 */
@Injectable()
export class ModuleGateInterceptor implements NestInterceptor {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{ originalUrl?: string; url: string; principal?: { kind: string; tenantId?: string } }>();
    const path = req.originalUrl ?? req.url;
    const mod = moduleOfPath(path);
    const erpOnly = erpOnlyPath(path);
    if (!mod && !erpOnly) return next.handle();
    return from(this.tenantOf(req.principal?.tenantId, path)).pipe(
      switchMap((tenantId) => from(tenantId ? this.state(tenantId) : Promise.resolve(null))),
      switchMap((st) => {
        if (st && erpOnly && st.edition === 'board') throw new ForbiddenException({ code: EDITION_BOARD_ONLY, message: BOARD_ONLY_MESSAGE });
        if (st && mod && st.off.includes(mod)) throw new ForbiddenException({ code: 'MODULE_DISABLED', message: 'This module is switched off for your institution' });
        return next.handle();
      }),
    );
  }

  private async tenantOf(tenantId: string | undefined, path: string): Promise<string | null> {
    if (tenantId) return tenantId;
    const slug = publicSlugOf(path);
    return slug ? ((await this.system.tenantBySlug(slug))?.id ?? null) : null;
  }

  private async state(tenantId: string) {
    const hit = cache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit;
    const st = await this.db.withTenant(tenantId, async (tx) => {
      const [r] = await tx.select({ d: institutionProfiles.disabledModules }).from(institutionProfiles);
      const [t] = await tx.select({ edition: tenants.edition }).from(tenants).where(eq(tenants.id, tenantId));
      return { at: Date.now(), off: (r?.d ?? []) as string[], edition: t?.edition ?? 'full' };
    });
    cache.set(tenantId, st);
    return st;
  }
}
