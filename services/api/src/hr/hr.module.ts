import { Module } from '@nestjs/common';
import { DelegationModule } from '../delegation/delegation.module.js';
import { ImportModule } from '../import/import.module.js';
import { ExitController } from './exit.controller.js';
import { HrController } from './hr.controller.js';
import { HrDepthController } from './hr-depth.controller.js';
import { HrReportsController } from './hr-reports.controller.js';
import { HrWorkflowsController } from './hr-workflows.controller.js';
import { HrService } from './hr.service.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
import { RecruitmentController } from './recruitment.controller.js';
import { StaffChangesController } from './staff-changes.controller.js';
import { StaffRecords } from './staff.records.js';
import { TalentController } from './talent.controller.js';

/** HR records, staff attendance, leave, recruitment, appraisal, onboarding, exit and payroll (docs/architecture/hr-payroll.md). */
@Module({
  imports: [DelegationModule, ImportModule],
  controllers: [HrController, LeaveController, RecruitmentController, TalentController, ExitController, PayrollController, StaffChangesController, HrDepthController, HrWorkflowsController, HrReportsController],
  providers: [HrService, LeaveService, PayrollService, StaffRecords],
  exports: [HrService, PayrollService],
})
export class HrModule {}
