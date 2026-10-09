import { Module } from '@nestjs/common';
import { DelegationModule } from '../delegation/delegation.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { BoundFlowsController } from './bound-flows.controller.js';
import { BoundFlowsService } from './bound-flows.service.js';
import { WorkflowsController } from './workflows.controller.js';
import { WorkflowsService } from './workflows.service.js';

/** Configurable approval workflows (e-governance). Other modules import this and call `WorkflowsService.start`. */
@Module({ imports: [NotificationsModule, TasksModule, DelegationModule, DocumentsModule], controllers: [WorkflowsController, BoundFlowsController], providers: [WorkflowsService, BoundFlowsService], exports: [WorkflowsService] })
export class WorkflowsModule {}
