import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DevicesController } from './devices.controller.js';
import { DigiLockerController } from './digilocker.controller.js';
import { EarlyAlertService, EarlyAlertsController } from './early-alerts.controller.js';
import { ApiTokenService, FeedsController } from './feeds.controller.js';
import { LtiController } from './lti.controller.js';
import { RetrievalController } from './retrieval.controller.js';
import { ScormController } from './scorm.controller.js';
import { Sip2Controller, Sip2Server, Sip2Service } from './sip2.js';

/** Government and campus integrations: DigiLocker/NAD/ABC, live devices, LTI and SCORM, OData and SIP2 feeds, semantic retrieval and early alerts (migration 0125). */
@Module({
  imports: [NotificationsModule],
  controllers: [DigiLockerController, DevicesController, LtiController, ScormController, FeedsController, Sip2Controller, RetrievalController, EarlyAlertsController],
  providers: [ApiTokenService, Sip2Service, Sip2Server, EarlyAlertService],
  exports: [EarlyAlertService],
})
export class IntegrationsModule {}
