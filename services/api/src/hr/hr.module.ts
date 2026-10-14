import { Module } from '@nestjs/common';
import { DelegationModule } from '../delegation/delegation.module.js';
import { ImportModule } from '../import/import.module.js';
import { ExitController } from './exit.controller.js';
import { HrController } from './hr.controller.js';
import { HrDepthController } from './hr-depth.controller.js';
import { HrMasterController } from './hr-master.controller.js';
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
import { StaffDepthRecords } from './staff-depth.records.js';
import { LeaveRecords } from './leave.records.js';
import { RecruitmentRecords } from './recruitment.records.js';
import { PayrollRecords } from './payroll.records.js';
import { HrMoreRecords } from './hr-more.records.js';
import { HiringController } from './hiring.controller.js';
import { TalentController } from './talent.controller.js';

/** HR records, staff attendance, leave, recruitment, appraisal, onboarding, exit and payroll (docs/architecture/hr-payroll.md). */
@Module({
  imports: [DelegationModule, ImportModule],
  controllers: [HrController, LeaveController, RecruitmentController, TalentController, ExitController, PayrollController, StaffChangesController, HrDepthController, HrWorkflowsController, HrReportsController, HrMasterController, HiringController],
  providers: [HrService, LeaveService, PayrollService, StaffRecords, StaffDepthRecords, LeaveRecords, RecruitmentRecords, PayrollRecords, HrMoreRecords],
  exports: [HrService, PayrollService],
})
export class HrModule {}
