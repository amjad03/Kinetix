import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { GradingAssistController } from './grading-assist.controller.js';

/** AI marking drafts for descriptive answers. The examiner or teacher always decides the marks. */
@Module({ imports: [AiModule], controllers: [GradingAssistController] })
export class GradingAssistModule {}
