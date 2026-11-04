import { Module } from '@nestjs/common';
import { CommsAdminController } from './comms-admin.controller.js';
import { CommsController } from './comms.controller.js';
import { CommsRecords } from './comms.records.js';
import { CommsService } from './comms.service.js';
import { CommsWebhooksController } from './comms-webhooks.controller.js';
import { channelProviders } from './providers.js';

/**
 * The communication engine: templates (with DLT and WhatsApp registration), audiences, scheduled campaigns with a
 * fallback chain, consent per channel, credits, the send log, provider callbacks and the delivery and cost reports.
 */
@Module({
  controllers: [CommsController, CommsAdminController, CommsWebhooksController],
  providers: [CommsService, CommsRecords, ...channelProviders],
  exports: [CommsService],
})
export class CommsModule {}
