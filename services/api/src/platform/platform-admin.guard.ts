import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Principal } from '../auth/principal.js';
import { SystemLookups } from '../db/system-lookups.service.js';

export const NOT_PLATFORM_ADMIN = 'Only the KINETIX platform team can do this';

/**
 * The KINETIX platform team (platform_admins), not an institution's staff. Runs after AuthGuard,
 * so the endpoint must also carry `@Auth('user')`. Checked on every request (no claim in the
 * token), so removing someone with `pnpm platform:admin --remove` takes effect at once.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly system: SystemLookups) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const p: Principal | undefined = ctx.switchToHttp().getRequest().principal;
    if (p?.kind !== 'user' || !(await this.system.isPlatformAdmin(p.userId))) throw new ForbiddenException(NOT_PLATFORM_ADMIN);
    return true;
  }
}
