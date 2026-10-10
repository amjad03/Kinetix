import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { AccreditationController } from './accreditation.controller.js';
import { AccreditationService } from './accreditation.service.js';

/** NAAC SSR/AQAR, NBA SAR, NIRF and AISHE data, the IQAC workspace and faculty evidence. */
@Module({ imports: [AnalyticsModule], controllers: [AccreditationController], providers: [AccreditationService] })
export class AccreditationModule {}
