import { Module } from '@nestjs/common';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';

/** Communication > Messages: announcements to boards and the Teacher, Student and Parent apps. */
@Module({ imports: [NotificationsModule, BroadcastsModule], controllers: [AnnouncementsController], providers: [AnnouncementsService], exports: [AnnouncementsService] })
export class AnnouncementsModule {}
