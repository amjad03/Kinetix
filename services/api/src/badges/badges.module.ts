import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { BadgesController } from './badges.controller.js';

/** Badges awarded by teachers (board, Teacher App); shown in the Student and Parent Apps. */
@Module({ imports: [NotificationsModule, TeacherModule], controllers: [BadgesController] })
export class BadgesModule {}
