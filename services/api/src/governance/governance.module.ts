import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { CommitteeGovService } from './committee-gov.service.js';
import { CommitteesGovController } from './committees-gov.controller.js';
import { ComplianceController, ComplianceReminders } from './compliance.controller.js';
import { DisclosureController, GovernanceDashboardController, PublicDisclosureController } from './disclosure.controller.js';
import { GovernanceController } from './governance.controller.js';
import { GovernancePassRecords } from './governance-pass.records.js';
import { GovernanceRecords } from './governance.records.js';
import { GovernanceService } from './governance.service.js';
import { PoliciesController } from './policies.controller.js';

/**
 * Business rule registry, incident register and file retention; statutory committees with meetings, minutes signed by
 * the members and the action-taken report; policies with versions and acknowledgement; the RTI register; the
 * compliance calendar with reminders; the mandatory disclosure page; and the board's governance dashboard.
 */
@Module({
  imports: [TasksModule],
  controllers: [GovernanceController, CommitteesGovController, PoliciesController, ComplianceController, DisclosureController, PublicDisclosureController, GovernanceDashboardController],
  providers: [GovernanceService, GovernanceRecords, CommitteeGovService, GovernancePassRecords, ComplianceReminders],
})
export class GovernanceModule {}
