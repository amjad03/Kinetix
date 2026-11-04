import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ChatSafetyService } from './chat-safety.service.js';
import { ConversationsController } from './messages.controller.js';

@Module({ imports: [NotificationsModule], controllers: [ConversationsController], providers: [ChatSafetyService], exports: [ChatSafetyService] })
export class MessagesModule {}
