import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

/** Tasks between staff, with an SLA-based overdue escalation. Other modules import this to raise tasks. */
@Module({ imports: [NotificationsModule], controllers: [TasksController], providers: [TasksService], exports: [TasksService] })
export class TasksModule {}
