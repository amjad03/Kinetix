import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CalendarAdminController, CalendarController, SettingsController } from './calendar.controller.js';

/** The academic calendar and institution settings. */
@Module({ imports: [NotificationsModule], controllers: [CalendarController, CalendarAdminController, SettingsController] })
export class CalendarModule {}
