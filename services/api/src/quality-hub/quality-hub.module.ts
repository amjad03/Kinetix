import { Module } from '@nestjs/common';
import { QualityHubController } from './quality-hub.controller.js';

/** Settings, record read models and reports for the quality, outcomes and engagement modules. */
@Module({ controllers: [QualityHubController] })
export class QualityHubModule {}
