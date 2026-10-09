import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { from, type Observable, switchMap } from 'rxjs';
import { DbService } from '../db/db.service.js';
import { institutionProfiles } from '../db/schema.js';
import { moduleOfPath } from './presets.js';

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; off: string[] }>();

/** Forget a tenant's cached module switches (after the profile or a preset changes). */
export const invalidateModuleGate = (tenantId?: string) => (tenantId ? cache.delete(tenantId) : cache.clear());

/**
 * Refuses API calls for a module the institution has switched off, so a hidden ERP section is not
 * reachable by URL or by an app. Runs after authentication; unauthenticated and platform routes pass.
 */
@Injectable()
export class ModuleGateInterceptor implements NestInterceptor {
  constructor(private readonly db: DbService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ originalUrl?: string; url: string; principal?: { kind: string; tenantId?: string } }>();
    const mod = moduleOfPath(req.originalUrl ?? req.url);
    const p = req.principal;
    if (!mod || !p || !p.tenantId) return next.handle();
    return from(this.disabled(p.tenantId)).pipe(
      switchMap((off) => {
        if (off.includes(mod)) throw new ForbiddenException({ code: 'MODULE_DISABLED', message: 'This module is switched off for your institution' });
        return next.handle();
      }),
    );
  }

  private async disabled(tenantId: string): Promise<string[]> {
    const hit = cache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.off;
    const off = await this.db.withTenant(tenantId, async (tx) => {
      const [r] = await tx.select({ d: institutionProfiles.disabledModules }).from(institutionProfiles);
      return r?.d ?? [];
    });
    cache.set(tenantId, { at: Date.now(), off });
    return off;
  }
}
