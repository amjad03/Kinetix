import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Principal, PrincipalKind, RoleName } from './principal.js';

export const AUTH_META = 'kinetix:auth';

export interface AuthRequirement {
  kinds: PrincipalKind[];
  /** For user principals: at least one of these roles. Empty = any signed-in user. */
  roles?: RoleName[];
}

/** Declares who may call an endpoint. Endpoints without @Auth are public. */
export const Auth = (kinds: PrincipalKind | PrincipalKind[], roles: RoleName[] = []) =>
  SetMetadata(AUTH_META, { kinds: Array.isArray(kinds) ? kinds : [kinds], roles } satisfies AuthRequirement);

export const ALLOW_PASSWORD_CHANGE_META = 'kinetix:allow-pwc';

/**
 * Lets a user who must change a temporary password call this endpoint anyway (GET /v1/me,
 * POST /v1/me/password, sign-out). Every other endpoint answers 403 PASSWORD_CHANGE_REQUIRED.
 */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_META, true);

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest().principal;
});

export const STAFF_ADMIN_ROLES: RoleName[] = ['tenant_admin', 'principal'];
export const BROADCAST_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod'];
export const TEACHING_ROLES: RoleName[] = ['teacher', 'hod', 'principal'];
