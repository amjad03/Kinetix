import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { InstitutionController } from './institution.controller.js';
import { ModuleGateInterceptor } from './module-gate.interceptor.js';
import { InstitutionSetupController } from './setup.controller.js';

/** Institution profile, capability profile (setup, presets, boards, module gate), per-programme attendance, campus fees and buildings. */
@Module({
  controllers: [InstitutionController, InstitutionSetupController],
  providers: [ModuleGateInterceptor, { provide: APP_INTERCEPTOR, useExisting: ModuleGateInterceptor }],
})
export class InstitutionModule {}
