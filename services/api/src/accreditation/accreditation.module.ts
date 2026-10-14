import { Module } from '@nestjs/common';
import { AccreditationController } from './accreditation.controller.js';
import { AccreditationService } from './accreditation.service.js';

/** The accreditation framework catalogue, metric computation, evidence, DVV, official exports, readiness and the IQAC workspace. */
@Module({ controllers: [AccreditationController], providers: [AccreditationService] })
export class AccreditationModule {}
