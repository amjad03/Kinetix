import { Module } from '@nestjs/common';
import { DelegationModule } from '../delegation/delegation.module.js';
import { ExitController } from './exit.controller.js';
import { HrController } from './hr.controller.js';
import { HrService } from './hr.service.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
import { RecruitmentController } from './recruitment.controller.js';
import { TalentController } from './talent.controller.js';

/** HR records, staff attendance, leave, recruitment, appraisal, onboarding, exit and payroll (docs/architecture/hr-payroll.md). */
@Module({
  imports: [DelegationModule],
  controllers: [HrController, LeaveController, RecruitmentController, TalentController, ExitController, PayrollController],
  providers: [HrService, LeaveService, PayrollService],
  exports: [HrService, PayrollService],
})
export class HrModule {}
