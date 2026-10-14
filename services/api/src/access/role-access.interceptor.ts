import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { from, type Observable, switchMap } from 'rxjs';
import { DbService } from '../db/db.service.js';
import { roleAccessRules } from '../db/schema-governance.js';
import { RecordRegistry } from '../records/entity.js';
import { accessModuleOfPath, allows, effectiveAccess, type AccessLevel } from './access-catalog.js';

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; rules: Map<string, AccessLevel> }>();

/** Forget a tenant's cached access rules (after they change). */
export const invalidateRoleAccess = (tenantId?: string) => (tenantId ? cache.delete(tenantId) : cache.clear());

/** The tenant's rules as `role:module` → level, read through a short cache. */
export async function loadRules(db: DbService, tenantId: string): Promise<Map<string, AccessLevel>> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rules;
  const rows = await db.withTenant(tenantId, (tx) => tx.select({ role: roleAccessRules.role, module: roleAccessRules.module, access: roleAccessRules.access }).from(roleAccessRules));
  const rules = new Map<string, AccessLevel>(rows.map((r) => [`${r.role}:${r.module}`, r.access]));
  cache.set(tenantId, { at: Date.now(), rules });
  return rules;
}

/**
 * Applies the institution's role access rules (Settings > Roles and permissions) to every signed-in API call, from
 * the ERP and the apps alike: a module a person's roles may not use answers 403 `ROLE_ACCESS_DENIED`, and a module
 * they may only look at refuses changes with 403 `ROLE_READ_ONLY`. Runs after the role guards, which still apply.
 */
@Injectable()
export class RoleAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly db: DbService,
    private readonly registry: RecordRegistry,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{ originalUrl?: string; url: string; method: string; principal?: { kind: string; tenantId?: string; roles?: string[] } }>();
    const p = req.principal;
    if (!p || p.kind !== 'user' || !p.tenantId || !p.roles?.length) return next.handle();
    const mod = accessModuleOfPath(req.originalUrl ?? req.url, (entity) => this.registry.find(entity)?.module);
    if (!mod) return next.handle();
    const tenantId = p.tenantId;
    const roles = p.roles;
    return from(loadRules(this.db, tenantId)).pipe(
      switchMap((rules) => {
        if (rules.size) {
          const level = effectiveAccess(roles, mod.key, rules);
          if (!allows(level, req.method)) {
            throw new ForbiddenException(
              level === 'none'
                ? { code: 'ROLE_ACCESS_DENIED', message: `Your institution has turned off ${mod.label} for your role` }
                : { code: 'ROLE_READ_ONLY', message: `Your role can only view ${mod.label}` },
            );
          }
        }
        return next.handle();
      }),
    );
  }
}
