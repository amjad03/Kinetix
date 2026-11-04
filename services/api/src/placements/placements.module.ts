import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AlumniGivingController } from './alumni-giving.controller.js';
import { AlumniPortalController } from './alumni-portal.controller.js';
import { CareersController } from './careers.controller.js';
import { InternshipExtrasController } from './internship-extras.controller.js';
import { InternshipExtrasService } from './internship-extras.service.js';
import { PlacementPassController } from './placement-pass.controller.js';
import { PlacementPassRecords } from './placement-pass.records.js';
import { PlacementReportsController } from './placement-reports.controller.js';
import { PlacementsDepthController } from './placements-depth.controller.js';
import { PlacementsRecords } from './placements.records.js';
import { SuccessStoriesController } from './success-stories.controller.js';
import { PlacementsController } from './placements.controller.js';
import { PlacementsService } from './placements.service.js';
import { RecruiterPortalController } from './recruiter-portal.controller.js';

/** Placements, internships, placement training and alumni (docs/architecture/placements-research-welfare.md). */
@Module({
  imports: [NotificationsModule, DocumentsModule],
  controllers: [PlacementReportsController, PlacementsController, PlacementsDepthController, PlacementPassController, CareersController, InternshipExtrasController, SuccessStoriesController, AlumniGivingController, AlumniPortalController, RecruiterPortalController],
  providers: [PlacementsService, InternshipExtrasService, PlacementsRecords, PlacementPassRecords],
  exports: [PlacementsService],
})
export class PlacementsModule {}
