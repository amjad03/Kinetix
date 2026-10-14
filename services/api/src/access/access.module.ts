import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AccessController } from './access.controller.js';
import { DataExportController } from './data-export.controller.js';
import { DataExportService } from './data-export.service.js';
import { RoleAccessInterceptor } from './role-access.interceptor.js';
import { UserRecords } from './users.records.js';

/** Users and access: accounts and roles, the role access rules (enforced on every API call), governance reports and full data exports. */
@Module({
  controllers: [AccessController, DataExportController],
  providers: [UserRecords, DataExportService, RoleAccessInterceptor, { provide: APP_INTERCEPTOR, useExisting: RoleAccessInterceptor }],
})
export class AccessModule {}
