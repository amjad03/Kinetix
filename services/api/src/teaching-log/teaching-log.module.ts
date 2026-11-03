import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { TeachingLogController } from './teaching-log.controller.js';
import { TeachingLogRecords } from './teaching-log.records.js';
import { TeachingLogService } from './teaching-log.service.js';

/** The teaching diary (work-done log), syllabus completion and the hours-taken register. */
@Module({ imports: [NotificationsModule, TeacherModule], controllers: [TeachingLogController], providers: [TeachingLogService, TeachingLogRecords], exports: [TeachingLogService] })
export class TeachingLogModule {}
