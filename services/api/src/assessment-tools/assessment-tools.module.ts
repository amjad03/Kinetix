import { Module } from '@nestjs/common';
import { AssessmentToolsController } from './assessment-tools.controller.js';

/** Reusable rubrics, reattempt requests and academic-integrity flags. */
@Module({ controllers: [AssessmentToolsController] })
export class AssessmentToolsModule {}
