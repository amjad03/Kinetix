import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { IsbnLookup } from './isbn-lookup.js';
import { LibraryController } from './library.controller.js';
import { LibraryDepthController } from './library-depth.controller.js';
import { LibraryMoreRecords } from './library-more.records.js';
import { LibraryOpsController } from './library-ops.controller.js';
import { LibraryRecords } from './library.records.js';

@Module({
  imports: [NotificationsModule, TimetableModule, FeesModule],
  controllers: [LibraryController, LibraryDepthController, LibraryOpsController],
  providers: [LibraryRecords, LibraryMoreRecords, IsbnLookup],
})
export class LibraryModule {}
