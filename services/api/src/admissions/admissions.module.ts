import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { StudentsModule } from '../students/students.module.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';
import { EnquiriesService } from './enquiries.service.js';
import { EntranceController } from './entrance.controller.js';
import { EntranceService } from './entrance.service.js';
import { PublicAdmissionsController } from './public-admissions.controller.js';

/** Admissions CRM: enquiries, cycles and applications, merit lists, offers and enrolment. */
@Module({
  imports: [FeesModule, StudentsModule],
  controllers: [AdmissionsController, EntranceController, PublicAdmissionsController],
  providers: [AdmissionsService, EnquiriesService, EntranceService],
})
export class AdmissionsModule {}
