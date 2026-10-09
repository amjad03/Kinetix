import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module.js';
import { StudentsModule } from '../students/students.module.js';
import { AdmissionsExtController, PublicAdmissionsExtController } from './admissions-ext.controller.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';
import { AgentsService } from './agents.service.js';
import { EnquiriesService } from './enquiries.service.js';
import { EntranceController } from './entrance.controller.js';
import { EntranceService } from './entrance.service.js';
import { GrowthController } from './growth.controller.js';
import { InterviewsService } from './interviews.service.js';
import { OnlineTestService } from './online-test.service.js';
import { PublicAdmissionsController } from './public-admissions.controller.js';

/** Admissions CRM: enquiries, cycles and applications, merit lists, offers and enrolment. */
@Module({
  imports: [FeesModule, StudentsModule],
  controllers: [AdmissionsController, AdmissionsExtController, EntranceController, GrowthController, PublicAdmissionsController, PublicAdmissionsExtController],
  providers: [AdmissionsService, EnquiriesService, EntranceService, AgentsService, InterviewsService, OnlineTestService],
})
export class AdmissionsModule {}
