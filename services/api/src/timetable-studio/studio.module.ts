import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TimetableStudioController } from './studio.controller.js';
import { StudioService } from './studio.service.js';
import { UnavailabilityRecords } from './unavailability.records.js';

/** The timetable studio: versions, the constraint generator, drag-and-drop editing with clash checks, publishing and printing; teacher unavailability. */
@Module({ imports: [NotificationsModule], controllers: [TimetableStudioController], providers: [StudioService, UnavailabilityRecords] })
export class TimetableStudioModule {}
