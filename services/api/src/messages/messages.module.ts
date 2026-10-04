import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ConversationsController } from './messages.controller.js';

@Module({ imports: [NotificationsModule], controllers: [ConversationsController] })
export class MessagesModule {}
