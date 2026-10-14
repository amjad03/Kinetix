import { Module } from '@nestjs/common';
import { LogMailer, Mailer, WebhookMailer } from '../analytics/mailer.js';
import { UnconfiguredWhatsApp, WhatsAppSender } from '../comms/channels.js';
import { ENV, type Env } from '../config/env.js';
import { ChatController } from './chat.controller.js';
import { ChatGroupsController } from './chat-groups.controller.js';

/** Staff chat: internal threads and external email / WhatsApp threads (redesign v2 Messages). */
@Module({
  controllers: [ChatController, ChatGroupsController],
  providers: [
    { provide: Mailer, inject: [ENV], useFactory: (env: Env) => (env.MAIL_WEBHOOK_URL ? new WebhookMailer(env.MAIL_WEBHOOK_URL, env.MAIL_FROM) : new LogMailer()) },
    { provide: WhatsAppSender, useClass: UnconfiguredWhatsApp },
  ],
})
export class ChatModule {}
