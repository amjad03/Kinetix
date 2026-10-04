import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { AssessmentsController, StudentMarksController } from './marks.controller.js';

@Module({ imports: [NotificationsModule, TeacherModule], controllers: [AssessmentsController, StudentMarksController] })
export class MarksModule {}
