import { Module } from '@nestjs/common';
import { HrController } from './hr.controller.js';
import { HrService } from './hr.service.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
import { RecruitmentController } from './recruitment.controller.js';

/** HR records, staff attendance, leave, recruitment and payroll (docs/architecture/hr-payroll.md). */
@Module({
  controllers: [HrController, LeaveController, RecruitmentController, PayrollController],
  providers: [HrService, LeaveService, PayrollService],
  exports: [HrService, PayrollService],
})
export class HrModule {}
