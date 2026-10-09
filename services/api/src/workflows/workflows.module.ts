import { Module } from '@nestjs/common';
import { DelegationModule } from '../delegation/delegation.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { WorkflowsController } from './workflows.controller.js';
import { WorkflowsService } from './workflows.service.js';

/** Configurable approval workflows (e-governance). Other modules import this and call `WorkflowsService.start`. */
@Module({ imports: [NotificationsModule, TasksModule, DelegationModule], controllers: [WorkflowsController], providers: [WorkflowsService], exports: [WorkflowsService] })
export class WorkflowsModule {}
