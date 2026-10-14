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
import { DepthController, LeadWebhookController, PublicAllotmentController } from './depth/depth.controller.js';
import { DepthService } from './depth/depth.service.js';
import { LeadsService } from './depth/leads.service.js';
import { LogMailer, Mailer, WebhookMailer } from '../analytics/mailer.js';
import { ConsoleTextSender, Msg91TextSender, TextSender, UnconfiguredWhatsApp, WhatsAppSender } from '../comms/channels.js';
import { ENV, type Env } from '../config/env.js';
import { DeskController, PublicDraftsController } from './desk/desk.controller.js';
import { AdmissionsDeskRecords } from './desk/desk.records.js';
import { DeskService } from './desk/desk.service.js';
import { GrowthController } from './growth.controller.js';
import { InterviewsService } from './interviews.service.js';
import { OnlineTestService } from './online-test.service.js';
import { PublicAdmissionsController } from './public-admissions.controller.js';

/** Admissions CRM: enquiries, cycles and applications, merit lists, offers and enrolment. */
@Module({
  imports: [FeesModule, StudentsModule],
  controllers: [AdmissionsController, AdmissionsExtController, EntranceController, GrowthController, DepthController, LeadWebhookController, PublicAllotmentController, PublicAdmissionsController, PublicAdmissionsExtController, DeskController, PublicDraftsController],
  providers: [
    AdmissionsService,
    EnquiriesService,
    EntranceService,
    AgentsService,
    InterviewsService,
    OnlineTestService,
    DepthService,
    LeadsService,
    DeskService,
    AdmissionsDeskRecords,
    // Messages to leads go out through the same channels as the communication engine.
    { provide: Mailer, inject: [ENV], useFactory: (env: Env) => (env.MAIL_WEBHOOK_URL ? new WebhookMailer(env.MAIL_WEBHOOK_URL, env.MAIL_FROM) : new LogMailer()) },
    { provide: TextSender, inject: [ENV], useFactory: (env: Env) => (env.SMS_PROVIDER === 'msg91' ? new Msg91TextSender({ authKey: env.MSG91_AUTH_KEY!, senderId: env.MSG91_SENDER_ID! }) : new ConsoleTextSender()) },
    { provide: WhatsAppSender, useClass: UnconfiguredWhatsApp },
  ],
})
export class AdmissionsModule {}
