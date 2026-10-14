import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { GovernanceController } from './governance.controller.js';
import { GovernanceRecords } from './governance.records.js';
import { GovernanceService } from './governance.service.js';

/** Business rule registry, incident register and file retention, with their record kit lists. */
@Module({ imports: [TasksModule], controllers: [GovernanceController], providers: [GovernanceService, GovernanceRecords] })
export class GovernanceModule {}
