import { Module } from '@nestjs/common';
import { SsoAdminController, SsoAuthController, SsoService } from './sso.controller.js';

/** Single sign-on with OpenID Connect (Google Workspace, Microsoft Entra, any provider) for staff and families of an institution. */
@Module({ controllers: [SsoAuthController, SsoAdminController], providers: [SsoService] })
export class SsoModule {}
