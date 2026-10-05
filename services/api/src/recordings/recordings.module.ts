import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { RecordingsAdminController, RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';
import { RetentionService } from './retention.service.js';

@Module({
  imports: [AiModule, NotificationsModule, TimetableModule],
  providers: [RecordingsService, RetentionService],
  controllers: [RecordingsController, RecordingsAdminController],
  exports: [RecordingsService, RetentionService],
})
export class RecordingsModule {}
