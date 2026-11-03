import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { CopyCatalogue } from './copy-catalogue.js';
import { IsbnLookup } from './isbn-lookup.js';
import { LibraryController } from './library.controller.js';
import { LibraryDepthController } from './library-depth.controller.js';
import { LibraryMoreRecords } from './library-more.records.js';
import { LibraryOpsController } from './library-ops.controller.js';
import { LibraryPassController } from './library-pass.controller.js';
import { LibraryPassRecords } from './library-pass.records.js';
import { LibraryRecords } from './library.records.js';
import { LibraryNotices } from './notices.js';

@Module({
  imports: [NotificationsModule, TimetableModule, FeesModule],
  controllers: [LibraryController, LibraryDepthController, LibraryOpsController, LibraryPassController],
  providers: [LibraryRecords, LibraryMoreRecords, LibraryPassRecords, IsbnLookup, CopyCatalogue, LibraryNotices],
})
export class LibraryModule {}
