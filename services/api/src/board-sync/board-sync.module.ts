import { Module } from '@nestjs/common';
import { BoardSyncController } from './board-sync.controller.js';
import { BoardSyncService } from './board-sync.service.js';

/** Board and room sync: the current period, exam room mode. */
@Module({ controllers: [BoardSyncController], providers: [BoardSyncService] })
export class BoardSyncModule {}
