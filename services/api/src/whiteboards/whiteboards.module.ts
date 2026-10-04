import { Module } from '@nestjs/common';
import { WhiteboardsController } from './whiteboards.controller.js';
import { WhiteboardsService } from './whiteboards.service.js';

@Module({ controllers: [WhiteboardsController], providers: [WhiteboardsService], exports: [WhiteboardsService] })
export class WhiteboardsModule {}
