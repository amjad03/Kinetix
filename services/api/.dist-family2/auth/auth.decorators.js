import { createParamDecorator, SetMetadata } from '@nestjs/common';
export const AUTH_META = 'kinetix:auth';
/** Declares who may call an endpoint. Endpoints without @Auth are public. */
export const Auth = (kinds, roles = []) => SetMetadata(AUTH_META, { kinds: Array.isArray(kinds) ? kinds : [kinds], roles });
export const CurrentPrincipal = createParamDecorator((_, ctx) => {
    return ctx.switchToHttp().getRequest().principal;
});
export const STAFF_ADMIN_ROLES = ['tenant_admin', 'principal'];
export const BROADCAST_ROLES = ['tenant_admin', 'principal', 'hod'];
export const TEACHING_ROLES = ['teacher', 'hod', 'principal'];
//# sourceMappingURL=auth.decorators.js.map