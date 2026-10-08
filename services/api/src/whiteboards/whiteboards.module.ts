import { Module } from '@nestjs/common';
import { PublicBoardsController, WhiteboardsController } from './whiteboards.controller.js';
import { WhiteboardsService } from './whiteboards.service.js';

@Module({ controllers: [WhiteboardsController, PublicBoardsController], providers: [WhiteboardsService], exports: [WhiteboardsService] })
export class WhiteboardsModule {}
