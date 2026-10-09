import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AlumniGivingController } from './alumni-giving.controller.js';
import { AlumniPortalController } from './alumni-portal.controller.js';
import { CareersController } from './careers.controller.js';
import { PlacementsController } from './placements.controller.js';
import { PlacementsService } from './placements.service.js';

/** Placements, internships and alumni (docs/architecture/placements-research-welfare.md). */
@Module({ imports: [NotificationsModule], controllers: [PlacementsController, CareersController, AlumniGivingController, AlumniPortalController], providers: [PlacementsService], exports: [PlacementsService] })
export class PlacementsModule {}
