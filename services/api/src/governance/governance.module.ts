import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { GovernanceController } from './governance.controller.js';

/** Business rule registry, incident register and file retention. */
@Module({ imports: [TasksModule], controllers: [GovernanceController] })
export class GovernanceModule {}
