import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StudentsModule } from '../students/students.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { AcademicsService } from './academics.service.js';
import { AcademicRecordsController } from './records.controller.js';
import { AcademicReportsController } from './reports.controller.js';
import { AcademicRequestsController } from './requests.controller.js';

/** Academics core: approval requests, module settings, record pages, the marks lock, lesson plan approval and reports. */
@Module({ imports: [NotificationsModule, StudentsModule, TimetableModule], controllers: [AcademicRequestsController, AcademicRecordsController, AcademicReportsController], providers: [AcademicsService] })
export class AcademicsModule {}
