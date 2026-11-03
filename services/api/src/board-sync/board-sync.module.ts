import { Module } from '@nestjs/common';
import { TeacherModule } from '../teacher/teacher.module.js';
import { BoardSyncController } from './board-sync.controller.js';
import { BoardSyncService } from './board-sync.service.js';

/** Board and room sync: the current period, exam room mode. */
@Module({ imports: [TeacherModule], controllers: [BoardSyncController], providers: [BoardSyncService] })
export class BoardSyncModule {}
