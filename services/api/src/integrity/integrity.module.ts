import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { IntegrityController } from './integrity.controller.js';

/** Similarity checks over written work. */
@Module({ imports: [TasksModule], controllers: [IntegrityController] })
export class IntegrityModule {}
