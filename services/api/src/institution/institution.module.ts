import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { InstitutionController } from './institution.controller.js';
import { ModuleGateInterceptor } from './module-gate.interceptor.js';
import { InstitutionSetupController } from './setup.controller.js';
import { CampusOverviewController } from './campus-overview.controller.js';
import { NotificationSettingsController } from './notification-settings.controller.js';
import { SettingsRecords } from './settings.records.js';

/** Institution profile, capability profile (setup, presets, boards, module gate), per-programme attendance, campus fees and buildings. */
@Module({
  controllers: [InstitutionController, InstitutionSetupController, CampusOverviewController, NotificationSettingsController],
  providers: [SettingsRecords, ModuleGateInterceptor, { provide: APP_INTERCEPTOR, useExisting: ModuleGateInterceptor }],
})
export class InstitutionModule {}
