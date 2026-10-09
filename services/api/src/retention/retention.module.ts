import { Module } from '@nestjs/common';
import { RetentionController } from './retention.controller.js';
import { RetentionService } from './retention.service.js';

/** Generic retention rules for vault documents, notifications and career-assistant chats. */
@Module({ controllers: [RetentionController], providers: [RetentionService], exports: [RetentionService] })
export class RetentionModule {}
