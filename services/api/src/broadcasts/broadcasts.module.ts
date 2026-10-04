import { Module } from '@nestjs/common';
import { BroadcastsController } from './broadcasts.controller.js';
import { BroadcastsService } from './broadcasts.service.js';

@Module({ controllers: [BroadcastsController], providers: [BroadcastsService] })
export class BroadcastsModule {}
