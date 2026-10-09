import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { LibraryController } from './library.controller.js';
import { LibraryDepthController } from './library-depth.controller.js';

@Module({ imports: [NotificationsModule, TimetableModule], controllers: [LibraryController, LibraryDepthController] })
export class LibraryModule {}
