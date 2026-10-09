import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AlumniGivingController } from './alumni-giving.controller.js';
import { AlumniPortalController } from './alumni-portal.controller.js';
import { CareersController } from './careers.controller.js';
import { InternshipExtrasController } from './internship-extras.controller.js';
import { InternshipExtrasService } from './internship-extras.service.js';
import { SuccessStoriesController } from './success-stories.controller.js';
import { PlacementsController } from './placements.controller.js';
import { PlacementsService } from './placements.service.js';

/** Placements, internships and alumni (docs/architecture/placements-research-welfare.md). */
@Module({ imports: [NotificationsModule, DocumentsModule], controllers: [PlacementsController, CareersController, InternshipExtrasController, SuccessStoriesController, AlumniGivingController, AlumniPortalController], providers: [PlacementsService, InternshipExtrasService], exports: [PlacementsService] })
export class PlacementsModule {}
