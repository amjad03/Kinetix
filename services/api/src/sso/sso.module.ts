import { Module } from '@nestjs/common';
import { SsoAdminController, SsoAuthController, SsoService } from './sso.controller.js';
import { SsoRecords } from './sso.records.js';

/** Single sign-on with OpenID Connect (Google Workspace, Microsoft Entra, any provider) for staff and families of an institution. */
@Module({ controllers: [SsoAuthController, SsoAdminController], providers: [SsoService, SsoRecords] })
export class SsoModule {}
