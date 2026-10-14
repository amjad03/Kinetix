import { Module } from '@nestjs/common';
import { AccreditationController } from './accreditation.controller.js';
import { AccreditationService } from './accreditation.service.js';
import { IqacController } from './iqac.controller.js';
import { IqacRecords } from './iqac.records.js';

/** The accreditation framework catalogue, metric computation, evidence, DVV, official exports, readiness and the IQAC workspace. */
@Module({ controllers: [AccreditationController, IqacController], providers: [AccreditationService, IqacRecords] })
export class AccreditationModule {}
