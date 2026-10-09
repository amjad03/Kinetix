import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DiaryController, DiaryService, ParentDiaryController, TeacherDiaryController } from './diary.controller.js';
import { EarlyYearsController, ParentEarlyYearsController } from './early-years.controller.js';
import { HealthRecordsController, ParentHealthController } from './health.controller.js';
import { PtmController } from './ptm.controller.js';
import { SchoolLifeService } from './school-life.service.js';

/** School diary, parent-teacher meetings, early years observations and learning stories, and student health records. */
@Module({
  imports: [NotificationsModule],
  controllers: [DiaryController, TeacherDiaryController, ParentDiaryController, PtmController, EarlyYearsController, ParentEarlyYearsController, HealthRecordsController, ParentHealthController],
  providers: [SchoolLifeService, DiaryService],
  exports: [SchoolLifeService],
})
export class SchoolLifeModule {}
