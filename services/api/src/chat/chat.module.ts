import { Module } from '@nestjs/common';
import { channelProviders } from '../comms/providers.js';
import { ChatController } from './chat.controller.js';
import { ChatGroupsController } from './chat-groups.controller.js';

/** Staff chat: internal threads and external email / WhatsApp threads (redesign v2 Messages). */
@Module({
  controllers: [ChatController, ChatGroupsController],
  providers: [...channelProviders],
})
export class ChatModule {}
