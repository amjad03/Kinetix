import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { SubmissionsController } from './submissions.controller.js';

/** Homework submissions (setting homework lives in the teacher module). */
@Module({ imports: [TeacherModule, NotificationsModule], controllers: [SubmissionsController] })
export class HomeworkModule {}
