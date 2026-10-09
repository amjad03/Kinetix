import { Module } from '@nestjs/common';
import { LogMailer, Mailer, WebhookMailer } from '../analytics/mailer.js';
import { ENV, type Env } from '../config/env.js';
import { ConsoleTextSender, Msg91TextSender, TextSender, UnconfiguredWhatsApp, WhatsAppSender } from './channels.js';
import { CommsController } from './comms.controller.js';
import { CommsService } from './comms.service.js';

/** The communication engine: templates, audiences, scheduled campaigns, retry and read status. */
@Module({
  controllers: [CommsController],
  providers: [
    CommsService,
    { provide: Mailer, inject: [ENV], useFactory: (env: Env) => (env.MAIL_WEBHOOK_URL ? new WebhookMailer(env.MAIL_WEBHOOK_URL, env.MAIL_FROM) : new LogMailer()) },
    { provide: TextSender, inject: [ENV], useFactory: (env: Env) => (env.SMS_PROVIDER === 'msg91' ? new Msg91TextSender({ authKey: env.MSG91_AUTH_KEY!, senderId: env.MSG91_SENDER_ID! }) : new ConsoleTextSender()) },
    { provide: WhatsAppSender, useClass: UnconfiguredWhatsApp },
  ],
  exports: [CommsService],
})
export class CommsModule {}
