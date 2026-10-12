import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ExamOfficeController } from './exam-office.controller.js';
import { ExamOfficeService } from './exam-office.service.js';

/** Exam office: the session workflow with approvals, records of every exam entity, reports and module settings. */
@Module({ imports: [NotificationsModule, TasksModule], controllers: [ExamOfficeController], providers: [ExamOfficeService] })
export class ExamOfficeModule {}
