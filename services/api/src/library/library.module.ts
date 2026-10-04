import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { LibraryController } from './library.controller.js';

@Module({ imports: [NotificationsModule, TimetableModule], controllers: [LibraryController] })
export class LibraryModule {}
